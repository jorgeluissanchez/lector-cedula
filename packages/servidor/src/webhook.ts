// SDK-20: verificación de X-Lector-Signature (AV-26) con crypto.subtle y comparación en tiempo constante propia.
// Nunca lanza: toda entrada inesperada termina en { valido: false, motivo }.

export type MotivoRechazo = "firma-ausente" | "formato-invalido" | "firma-incorrecta" | "fuera-de-tolerancia" | "cuerpo-invalido";

export interface EventoWebhook {
  id: string;
  type: string;
  created_at: string;
  sandbox: boolean;
  data: { validation_id: string; status: string; declined_reason: string | null; [clave: string]: unknown };
  [clave: string]: unknown;
}

export type ResultadoVerificacion = { valido: true; evento: EventoWebhook } | { valido: false; motivo: MotivoRechazo };

export interface EntradaVerificacion {
  /** Bytes exactos recibidos (sin parsear ni re-serializar). */
  cuerpo: Uint8Array | string;
  /** Valor de la cabecera X-Lector-Signature. */
  firma: string | null | undefined;
  secreto: string;
  /** Unix en segundos; por defecto, el reloj del sistema. */
  ahora?: number;
  /** Segundos de tolerancia; por defecto 300. */
  tolerancia?: number;
}

export const TOLERANCIA_POR_DEFECTO = 300;

const RE_T = /^\d{1,15}$/;
const RE_V1 = /^[0-9a-f]{64}$/;

function rechazo(motivo: MotivoRechazo): ResultadoVerificacion {
  return { valido: false, motivo };
}

/** Compara dos arreglos del mismo largo sin salir antes de tiempo. */
export function compararTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= (a[i] as number) ^ (b[i] as number);
  return diferencia === 0;
}

function hexABytes(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

function leerCabecera(firma: string): { t: number; v1: string[] } | null {
  let t: number | null = null;
  const v1: string[] = [];
  for (const parte of firma.split(",")) {
    const igual = parte.indexOf("=");
    if (igual < 1) return null;
    const clave = parte.slice(0, igual).trim();
    const valor = parte.slice(igual + 1).trim();
    if (clave === "t") {
      if (t !== null || !RE_T.test(valor)) return null;
      t = Number(valor);
    } else if (clave === "v1") {
      if (!RE_V1.test(valor)) return null;
      v1.push(valor);
    }
  }
  if (t === null || v1.length === 0) return null;
  return { t, v1 };
}

function esEvento(x: unknown): x is EventoWebhook {
  const data = (x as { data?: unknown } | null | undefined)?.data;
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

async function verificarSinCaptura(entrada: EntradaVerificacion): Promise<ResultadoVerificacion> {
  const { cuerpo, firma, secreto } = entrada;
  if (firma === undefined || firma === null || firma === "") return rechazo("firma-ausente");
  if (typeof firma !== "string") return rechazo("formato-invalido");
  const cabecera = leerCabecera(firma);
  if (cabecera === null) return rechazo("formato-invalido");
  let bytes: Uint8Array;
  if (typeof cuerpo === "string") bytes = new TextEncoder().encode(cuerpo);
  else if (cuerpo instanceof Uint8Array) bytes = cuerpo;
  else return rechazo("cuerpo-invalido");
  if (typeof secreto !== "string" || secreto === "") return rechazo("firma-incorrecta");

  const codificador = new TextEncoder();
  const prefijo = codificador.encode(`${cabecera.t}.`);
  const mensaje = new Uint8Array(prefijo.length + bytes.length);
  mensaje.set(prefijo, 0);
  mensaje.set(bytes, prefijo.length);
  const llave = await crypto.subtle.importKey("raw", codificador.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = new Uint8Array(await crypto.subtle.sign("HMAC", llave, mensaje));
  let coincide = false;
  for (const v1 of cabecera.v1) coincide = compararTiempoConstante(esperado, hexABytes(v1)) || coincide;
  if (!coincide) return rechazo("firma-incorrecta");

  const ahora = Number.isFinite(entrada.ahora) ? (entrada.ahora as number) : Math.floor(Date.now() / 1000);
  const tolerancia = typeof entrada.tolerancia === "number" && entrada.tolerancia >= 0 ? entrada.tolerancia : TOLERANCIA_POR_DEFECTO;
  if (Math.abs(ahora - cabecera.t) > tolerancia) return rechazo("fuera-de-tolerancia");

  let evento: unknown = null;
  try {
    evento = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    // JSON o UTF-8 inválido: esEvento(null) es falso y se rechaza abajo.
  }
  if (!esEvento(evento)) return rechazo("cuerpo-invalido");
  return { valido: true, evento };
}

/** Verifica un webhook firmado según AV-26. Nunca lanza ni rechaza la promesa. */
export async function verificarWebhook(entrada: EntradaVerificacion): Promise<ResultadoVerificacion> {
  try {
    return await verificarSinCaptura(entrada);
  } catch {
    return rechazo("firma-incorrecta");
  }
}
