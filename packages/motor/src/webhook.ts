// MOT-16 Webhooks opcionales: tras cada lectura, un único `POST url` (sin reintentos) con
// `{ evento, tipo, riesgo_nivel, codigo? }` (sin campos personales). Única excepción a MOT-06 y solo con `webhook`
// configurado; la URL es `https` o un `http` de localhost. El envío no se espera: su fallo (red, 5xx, tiempo) no
// cambia ni retrasa el resultado.
// MOT-26 Firma antirrepetición con el formato AV-26 del modo microservicio:
// `X-Lector-Signature: t=<unix>,v1=<hex HMAC-SHA256(secreto, "<unix>." + cuerpo)>`; el receptor la comprueba con
// `verificarFirmaWebhook` y rechaza si `t` se aleja más de 300 s de su reloj.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ErrorMotor, type ResultadoMotor } from "@lector-cedula/protocolo";

export interface OpcionesWebhook {
  readonly url: string;
  readonly secreto: string;
}

export interface CuerpoWebhook {
  readonly evento: "lectura";
  readonly tipo: string | null;
  readonly riesgo_nivel: string | null;
  readonly codigo?: string;
}

/** Tiempo máximo de un envío; pasado, se aborta en silencio. */
export const TIEMPO_WEBHOOK_MS = 5_000;

const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Valida la configuración (lanza `opciones-invalidas`) y devuelve la URL normalizada. */
export function validarWebhook(webhook: unknown): OpcionesWebhook {
  const w = (typeof webhook === "object" && webhook !== null ? webhook : {}) as { url?: unknown; secreto?: unknown };
  if (typeof w.url !== "string" || typeof w.secreto !== "string" || w.secreto.length === 0) throw new ErrorMotor("opciones-invalidas");
  let url: URL;
  try {
    url = new URL(w.url);
  } catch {
    throw new ErrorMotor("opciones-invalidas");
  }
  const segura = url.protocol === "https:" || (url.protocol === "http:" && LOCALES.has(url.hostname));
  if (!segura) throw new ErrorMotor("opciones-invalidas");
  return { url: url.href, secreto: w.secreto };
}

/** Cuerpo sin datos del documento: tipo, nivel de riesgo y, si no hubo lectura, el código. */
export function cuerpoWebhook(salida: { readonly resultado: ResultadoMotor } | { readonly codigo: string }): CuerpoWebhook {
  if ("codigo" in salida) return { evento: "lectura", tipo: null, riesgo_nivel: null, codigo: salida.codigo };
  const r = salida.resultado;
  if (!r.ok) return { evento: "lectura", tipo: null, riesgo_nivel: null, codigo: r.error.codigo };
  return { evento: "lectura", tipo: r.tipoDocumento, riesgo_nivel: r.riesgo?.nivel ?? null };
}

/** Segundos de diferencia admitidos entre `t` y el reloj del receptor. */
export const TOLERANCIA_WEBHOOK_S = 300;

const RE_T = /^[0-9]{1,15}$/u;
const RE_V1 = /^[0-9a-f]{64}$/u;

function hmac(secreto: string, t: number, cuerpo: string | Uint8Array): Buffer {
  return createHmac("sha256", secreto).update(`${t}.`).update(cuerpo).digest();
}

/** Valor de `X-Lector-Signature` para `cuerpo` enviado en el segundo unix `t`. */
export function firmar(secreto: string, cuerpo: string, t: number): string {
  return `t=${t},v1=${hmac(secreto, t, cuerpo).toString("hex")}`;
}

/** `t=<unix>,v1=<hex>[,v1=<hex>...]`; espacios alrededor y claves desconocidas se toleran (como AV-26). */
function leerFirma(cabecera: string): { t: number; v1: Buffer[] } | null {
  let t: number | null = null;
  const v1: Buffer[] = [];
  for (const parte of cabecera.split(",")) {
    const igual = parte.indexOf("=");
    if (igual < 1) return null;
    const clave = parte.slice(0, igual).trim();
    const valor = parte.slice(igual + 1).trim();
    if (clave === "t") {
      if (t !== null || !RE_T.test(valor)) return null;
      t = Number(valor);
    } else if (clave === "v1") {
      if (!RE_V1.test(valor)) return null;
      v1.push(Buffer.from(valor, "hex"));
    }
  }
  // Sin ningún v1 el bucle de comparación no encuentra coincidencia: basta exigir `t`.
  return t === null ? null : { t, v1 };
}

/**
 * Verifica `X-Lector-Signature` de un webhook del motor. `cuerpo` son los bytes exactos recibidos (sin re-serializar);
 * `ahora` en segundos unix (por defecto, el reloj). `true` solo si algún `v1` coincide en tiempo constante y
 * `|ahora - t| <= 300`. Nunca lanza.
 */
export function verificarFirmaWebhook(cuerpo: string | Uint8Array, cabecera: string | null | undefined, secreto: string, ahora?: number): boolean {
  // Sin try/catch: cada guarda evita una excepción y las pruebas con entradas arbitrarias lo comprueban.
  if (typeof cabecera !== "string" || typeof secreto !== "string" || secreto === "") return false;
  if (typeof cuerpo !== "string" && !(cuerpo instanceof Uint8Array)) return false;
  if (ahora !== undefined && typeof ahora !== "number") return false;
  const firma = leerFirma(cabecera);
  if (firma === null) return false;
  const reloj = ahora ?? Math.floor(Date.now() / 1000);
  if (!(Math.abs(reloj - firma.t) <= TOLERANCIA_WEBHOOK_S)) return false;
  const esperado = hmac(secreto, firma.t, cuerpo);
  // Sin salida temprana: todos los v1 se comparan (32 bytes cada uno) en tiempo constante.
  let coincide = false;
  for (const v of firma.v1) coincide = timingSafeEqual(esperado, v) || coincide;
  return coincide;
}

/** Envía una sola vez, sin esperar ni propagar errores. */
export function enviarWebhook(webhook: OpcionesWebhook, cuerpo: CuerpoWebhook): void {
  const texto = JSON.stringify(cuerpo);
  fetch(webhook.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lector-signature": firmar(webhook.secreto, texto, Math.floor(Date.now() / 1000)) },
    body: texto,
    redirect: "error",
    signal: AbortSignal.timeout(TIEMPO_WEBHOOK_MS),
  }).then(
    (r) => r.body?.cancel().catch(() => undefined),
    () => undefined,
  );
}
