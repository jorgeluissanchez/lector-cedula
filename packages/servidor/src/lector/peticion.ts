// MOT-19 y MOT-23: lectura de la petición solo en memoria. Corta con 413 antes de terminar de leer un cuerpo mayor que
// el límite (por Content-Length o contando bytes del flujo), admite multipart (`imagen` y `cliente`) y binario
// (`image/*` con `X-Lector-Cliente` en base64url) y pone a cero cada búfer propio al terminar.
import { CABECERA_CLIENTE, CAMPO_CLIENTE, CAMPO_IMAGEN } from "@lector-cedula/protocolo";

/**
 * Espía de asignaciones para las pruebas de MOT-23: solo con NODE_ENV=test y un arreglo instalado en esta clave global.
 * No forma parte de la API pública ni de los tipos.
 */
const CLAVE_REGISTRO = Symbol.for("@lector-cedula/servidor.registroBuferes");

export function registrarBufer(b: Uint8Array): Uint8Array {
  if (process.env.NODE_ENV === "test") {
    const registro = (globalThis as Record<symbol, unknown>)[CLAVE_REGISTRO];
    if (Array.isArray(registro)) registro.push(b);
  }
  return b;
}

export function borrar(...buferes: (Uint8Array | null | undefined)[]): void {
  for (const b of buferes) b?.fill(0);
}

/** Sin cliente: el front no envió su lectura local (modo front-back con dispositivo débil); se valida sin comparar. */
export const SIN_CLIENTE: unique symbol = Symbol("sin-cliente");
/** Cliente presente pero ilegible (JSON roto, base64url inválido): `compararConCliente` lo marca `cliente-invalido`. */
export const CLIENTE_ILEGIBLE: unique symbol = Symbol("cliente-ilegible");

export type ClienteRecibido = typeof SIN_CLIENTE | typeof CLIENTE_ILEGIBLE | unknown;

export type EntradaLeida =
  | { readonly tipo: "ok"; readonly imagen: Uint8Array; readonly cliente: ClienteRecibido }
  | { readonly tipo: "demasiado-grande" }
  | { readonly tipo: "no-admitido" }
  | { readonly tipo: "malformada" };

async function leerAcotado(peticion: Request, maximo: number): Promise<Uint8Array | "demasiado-grande"> {
  const cuerpo = peticion.body;
  if (cuerpo === null) return registrarBufer(new Uint8Array(0));
  const lector = cuerpo.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(registrarBufer(value));
      total += value.byteLength;
      if (total > maximo) {
        await lector.cancel().catch(() => undefined);
        return "demasiado-grande";
      }
    }
    const todo = registrarBufer(new Uint8Array(total));
    let desde = 0;
    for (const t of trozos) {
      todo.set(t, desde);
      desde += t.byteLength;
    }
    return todo;
  } finally {
    borrar(...trozos);
  }
}

function jsonCliente(texto: string): unknown {
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return CLIENTE_ILEGIBLE;
  }
}

const BASE64URL = /^[A-Za-z0-9_-]*={0,2}$/u;

function clienteDeCabecera(valor: string | null): ClienteRecibido {
  if (valor === null) return SIN_CLIENTE;
  if (!BASE64URL.test(valor)) return CLIENTE_ILEGIBLE;
  return jsonCliente(Buffer.from(valor, "base64url").toString("utf8"));
}

async function deMultipart(cuerpo: Uint8Array, tipo: string): Promise<EntradaLeida> {
  let datos: FormData;
  try {
    datos = await new Response(cuerpo as Uint8Array<ArrayBuffer>, { headers: { "content-type": tipo } }).formData();
  } catch {
    return { tipo: "malformada" };
  }
  const archivo = datos.get(CAMPO_IMAGEN);
  if (archivo === null || typeof archivo === "string") return { tipo: "malformada" };
  const imagen = registrarBufer(new Uint8Array(await archivo.arrayBuffer()));
  if (imagen.byteLength === 0) return { tipo: "malformada" };
  const crudo = datos.get(CAMPO_CLIENTE);
  let cliente: ClienteRecibido = SIN_CLIENTE;
  if (typeof crudo === "string") cliente = jsonCliente(crudo);
  else if (crudo !== null) cliente = jsonCliente(await crudo.text());
  return { tipo: "ok", imagen, cliente };
}

/** Lee y separa la petición. La imagen devuelta es un búfer propio (el llamador la pone a cero). */
export async function leerEntrada(peticion: Request, maximo: number): Promise<EntradaLeida> {
  const declarado = Number(peticion.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declarado) && declarado > maximo) {
    await peticion.body?.cancel().catch(() => undefined);
    return { tipo: "demasiado-grande" };
  }
  // La frontera del multipart distingue mayúsculas: solo se pasa a minúsculas para clasificar.
  const tipoOriginal = peticion.headers.get("content-type") ?? "";
  const tipo = tipoOriginal.toLowerCase();
  const esMultipart = tipo.startsWith("multipart/form-data");
  const esBinario = tipo.startsWith("image/") || tipo.startsWith("application/octet-stream");
  if (!esMultipart && !esBinario) {
    await peticion.body?.cancel().catch(() => undefined);
    return { tipo: "no-admitido" };
  }
  // Margen para las cabeceras de las partes del multipart: el límite se aplica a la imagen.
  const cuerpo = await leerAcotado(peticion, esMultipart ? maximo + 64 * 1024 : maximo);
  if (cuerpo === "demasiado-grande") return { tipo: "demasiado-grande" };
  if (esBinario) {
    if (cuerpo.byteLength === 0) return { tipo: "malformada" };
    return { tipo: "ok", imagen: cuerpo, cliente: clienteDeCabecera(peticion.headers.get(CABECERA_CLIENTE)) };
  }
  try {
    const entrada = await deMultipart(cuerpo, tipoOriginal);
    if (entrada.tipo === "ok" && entrada.imagen.byteLength > maximo) {
      borrar(entrada.imagen);
      return { tipo: "demasiado-grande" };
    }
    return entrada;
  } finally {
    borrar(cuerpo);
  }
}
