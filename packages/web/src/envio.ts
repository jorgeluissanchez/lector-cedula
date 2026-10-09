/**
 * Envío opcional al microservicio (SDK-38, SDK-15). Solo con `servidor` y `sesion`: intercambia el token alojado en
 * `POST {servidor}/v/{sesion}/inicio` (design.md, decisión 8) y sube la imagen de la captura a `upload.url`. Nunca
 * envía campos del documento (SDK-17) y nunca lanza: devuelve `enviado` o `fallido` con su código.
 */
import type { CodigoEnvio, EnvioLector } from "./tipos.js";

export interface DatosEnvio {
  readonly servidor: string;
  readonly sesion: string;
  readonly imagen: Blob;
  readonly fetch: typeof fetch;
}

/** `upload.url` debe ser del mismo origen que `servidor` y segura (https o http localhost). */
export function urlSubidaValida(url: string, servidor: string): boolean {
  let u: URL;
  let s: URL;
  try {
    u = new URL(url);
    s = new URL(servidor);
  } catch {
    return false;
  }
  if (u.origin !== s.origin) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
}

const fallido = (codigo: CodigoEnvio): EnvioLector => ({ estado: "fallido", codigo });

async function slug(r: Response): Promise<string> {
  try {
    return String(((await r.json()) as { type?: unknown }).type);
  } catch {
    return "";
  }
}

async function codigoSesion(r: Response): Promise<CodigoEnvio> {
  if (r.status === 410 || /expired/u.test(await slug(r))) return "sesion-vencida";
  if (r.status === 401 || r.status === 403 || r.status === 404) return "sesion-invalida";
  return "servidor-no-disponible";
}

export async function enviarCaptura(d: DatosEnvio): Promise<EnvioLector> {
  const base = d.servidor.replace(/\/+$/u, "");
  let inicio: Response;
  try {
    inicio = await d.fetch(`${base}/v/${encodeURIComponent(d.sesion)}/inicio`, { method: "POST", credentials: "omit" });
  } catch {
    return fallido("servidor-no-disponible");
  }
  if (!inicio.ok) return fallido(await codigoSesion(inicio));
  let id: unknown;
  let url: unknown;
  try {
    const cuerpo = (await inicio.json()) as { id?: unknown; validation_id?: unknown; upload?: { url?: unknown } | null };
    id = cuerpo.validation_id ?? cuerpo.id;
    url = cuerpo.upload?.url;
  } catch {
    return fallido("servidor-no-disponible");
  }
  // `String(url)` de un valor no textual nunca es una URL válida.
  if (typeof id !== "string" || !urlSubidaValida(String(url), base)) return fallido("sesion-invalida");
  // Tarea 4.3: tras `/v/{sesion}/inicio` el servidor acepta una sola cara; la imagen viaja una vez, como `front`.
  const cuerpo = new FormData();
  const destino = String(url);
  cuerpo.append("front", d.imagen, "front.jpg");
  let subida: Response;
  try {
    subida = await d.fetch(destino, { method: "POST", body: cuerpo, credentials: "omit" });
  } catch {
    return fallido("servidor-no-disponible");
  }
  if (subida.ok) return { estado: "enviado", validacion_id: id };
  return fallido(/expired/u.test(await slug(subida)) ? "sesion-vencida" : "subida-fallida");
}
