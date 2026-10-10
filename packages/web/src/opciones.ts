/**
 * Validación de `OpcionesLector` (SDK-27 "Servidor inválido", SDK-38 "Sesión sin servidor"). Nunca lanza: devuelve el
 * nombre de la primera opción inválida o `null`.
 */
import type { OpcionesLector } from "./tipos.js";

const TIPOS = new Set(["cedula-ciudadania", "cedula-extranjeria", "pasaporte", "tarjeta-identidad"]);

function urlValida(v: unknown): boolean {
  if (typeof v !== "string") return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

/** SDK-45: ruta relativa, mismo origen, https o http localhost. */
export function backendValido(v: unknown, origen: string | undefined = (globalThis as { location?: { origin?: string } }).location?.origin): boolean {
  if (typeof v !== "string" || v.length === 0 || /^[/\\]{2}/u.test(v) || /\s/u.test(v)) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    // Sin esquema: ruta relativa al documento.
    return true;
  }
  return urlValida(v) || (u.origin !== "null" && u.origin === origen);
}

const MODOS = new Set(["front", "back", "front-back"]);
const positivo = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;

export function opcionInvalida(o: unknown): string | null {
  if (typeof o !== "object" || o === null) return "opciones";
  const op = o as Record<keyof OpcionesLector, unknown>;
  if (op.servidor !== undefined && !urlValida(op.servidor)) return "servidor";
  if (op.sesion !== undefined) {
    if (op.servidor === undefined) return "servidor";
    if (typeof op.sesion !== "string" || !/^[A-Za-z0-9_-]{1,512}$/u.test(op.sesion)) return "sesion";
  }
  if (op.backend !== undefined && (!backendValido(op.backend) || op.servidor !== undefined || op.sesion !== undefined)) return "backend";
  if (op.encabezadosBackend !== undefined && typeof op.encabezadosBackend !== "function" && (typeof op.encabezadosBackend !== "object" || op.encabezadosBackend === null)) return "encabezadosBackend";
  if (op.modo !== undefined && !MODOS.has(op.modo as string)) return "modo";
  const modo = op.modo ?? (op.backend === undefined ? "front" : "front-back");
  if (modo !== "front" && op.backend === undefined) return "modo";
  if (op.validacion !== undefined && ((op.validacion !== "estricta" && op.validacion !== "auto") || modo !== "front-back")) return "validacion";
  if (op.umbralesAuto !== undefined && (typeof op.umbralesAuto !== "object" || op.umbralesAuto === null)) return "umbralesAuto";
  if (op.streaming !== undefined && typeof op.streaming !== "boolean") return "streaming";
  if (op.autoIniciar !== undefined && typeof op.autoIniciar !== "boolean") return "autoIniciar";
  for (const k of ["tiempoColaMs", "tiempoLimiteMs", "inactividadMs"] as const) if (op[k] !== undefined && !positivo(op[k])) return k;
  const iv = op.intentosVerificacion;
  if (iv !== undefined && !(Number.isInteger(iv) && (iv as number) >= 1 && (iv as number) <= 10)) return "intentosVerificacion";
  if (op.recursos !== undefined) {
    if (typeof op.recursos !== "string") return "recursos";
    try {
      new URL(op.recursos, "http://localhost/");
    } catch {
      return "recursos";
    }
  }
  if (op.documentos !== undefined && !(Array.isArray(op.documentos) && op.documentos.length > 0 && op.documentos.every((d) => TIPOS.has(d as string)))) return "documentos";
  if (op.admitirTi !== undefined && typeof op.admitirTi !== "boolean") return "admitirTi";
  if (op.enviarMenores !== undefined && typeof op.enviarMenores !== "boolean") return "enviarMenores";
  if (op.idioma !== undefined && op.idioma !== "es" && op.idioma !== "en") return "idioma";
  if (op.guia !== undefined) {
    const g = op.guia as Record<string, unknown> | null;
    if (typeof g !== "object" || g === null) return "guia";
    if (g["orientacion"] !== undefined && g["orientacion"] !== "horizontal" && g["orientacion"] !== "vertical") return "guia";
    const m = g["margen"];
    if (m !== undefined && !(typeof m === "number" && Number.isFinite(m) && m >= 0 && m <= 0.25)) return "guia";
  }
  return null;
}
