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

export function opcionInvalida(o: unknown): string | null {
  if (typeof o !== "object" || o === null) return "opciones";
  const op = o as Record<keyof OpcionesLector, unknown>;
  if (op.servidor !== undefined && !urlValida(op.servidor)) return "servidor";
  if (op.sesion !== undefined) {
    if (op.servidor === undefined) return "servidor";
    if (typeof op.sesion !== "string" || !/^[A-Za-z0-9_-]{1,512}$/u.test(op.sesion)) return "sesion";
  }
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
  if (op.idioma !== undefined && op.idioma !== "es" && op.idioma !== "en") return "idioma";
  return null;
}
