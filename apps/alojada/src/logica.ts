/**
 * Lógica pura de la página alojada `/v/{token}` (sdk-integracion, SDK-14). Sin DOM: la prueban las unitarias y la usa
 * `main.ts`. Nunca lanza.
 */
import type { EstadoLector, OpcionesLector } from "@lector-cedula/web";

export type DocumentoSesion = "cedula" | "tarjeta-identidad";

export type ConfiguracionSesion =
  | { readonly estado: "invalida" }
  | {
      readonly estado: "valida";
      readonly validation_id: string;
      readonly return_url: string | null;
      readonly version_texto: string;
      readonly documento: DocumentoSesion;
    };

const INVALIDA: ConfiguracionSesion = { estado: "invalida" };
const ID = /^val_[0-9a-f]{32}$/u;

/** Configuración que el servidor inserta en `#config-sesion`; cualquier forma inesperada es `invalida`. */
export function leerConfiguracion(texto: string | null): ConfiguracionSesion {
  let d: unknown;
  try {
    d = JSON.parse(texto ?? "");
  } catch {
    return INVALIDA;
  }
  if (typeof d !== "object" || d === null || Array.isArray(d)) return INVALIDA;
  const o = d as Record<string, unknown>;
  if (o["estado"] !== "valida") return INVALIDA;
  const id = o["validation_id"];
  const retorno = o["return_url"];
  const version = o["version_texto"];
  const documento = o["documento"];
  if (typeof id !== "string" || !ID.test(id)) return INVALIDA;
  if (retorno !== null && typeof retorno !== "string") return INVALIDA;
  if (typeof version !== "string") return INVALIDA;
  if (documento !== "cedula" && documento !== "tarjeta-identidad") return INVALIDA;
  return { estado: "valida", validation_id: id, return_url: retorno, version_texto: version, documento };
}

/** `return_url` con exactamente `validation_id` y `estado`, sin fragmento (ni el token ni datos del documento). */
export function urlRetorno(base: string, id: string, estado: "completada" | "cancelada"): string {
  const u = new URL(base);
  u.search = "";
  u.hash = "";
  u.searchParams.set("validation_id", id);
  u.searchParams.set("estado", estado);
  return u.href;
}

export function tokenDeRuta(ruta: string): string | null {
  const m = /^\/v\/([A-Za-z0-9_-]+)$/u.exec(ruta);
  return m?.[1] ?? null;
}

/** Motor desde `/sdk/v1/` y envío al mismo servidor que sirvió la página. */
export function opcionesLector(origen: string, sesion: string, documento: DocumentoSesion): OpcionesLector {
  const base = { recursos: `${origen}/sdk/v1/`, servidor: origen, sesion };
  // La tarjeta de identidad muestra antes el aviso reforzado (menor de edad): se admite y se envía.
  return documento === "tarjeta-identidad" ? { ...base, admitirTi: true, enviarMenores: true } : base;
}

export type PantallaLectura = "captura" | "enviando" | "completada" | "fallo" | "error";

export function pantallaDe(e: EstadoLector): PantallaLectura {
  if (e.fase === "error") return "error";
  if (e.fase !== "resultado") return "captura";
  if (e.envio?.estado === "enviado") return "completada";
  if (e.envio?.estado === "fallido") return "fallo";
  return "enviando";
}
