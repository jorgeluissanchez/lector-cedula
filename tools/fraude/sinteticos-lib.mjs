/**
 * Biblioteca del generador de escenas sintéticas de ataques (cambio deteccion-fraude, FRA-13). Las escenas las
 * dibuja `@lector-cedula/fraud/sintetico` (código propio, MIT); aquí se planifica, se codifica en PNG (pngjs, MIT)
 * y se valida el manifiesto. Sin datos de personas reales.
 */
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

export const CLASES = ["autentica", "pantalla", "fotocopia-gris", "fotocopia-color", "impresion", "recortada", "editada"];
export const TIPOS = ["amarilla", "digital"];
export const MUESTRAS_POR_DEFECTO = 200;

/** Claves que nunca pueden aparecer en el manifiesto (privacidad, FRA-13 y FRA-15). */
const CLAVES_PROHIBIDAS = new Set(["nuip", "nombre", "nombres", "apellidos", "participante", "imagenReal", "fechaNacimiento"]);

export class ErrorArgumentos extends Error {}

/** Normaliza las opciones del CLI. Lanza `ErrorArgumentos` si son inválidas. */
export function planGeneracion(o) {
  const lista = (x, todas, nombre) => {
    if (x === undefined) return [...todas];
    const v = String(x).split(",").filter((s) => s !== "");
    if (v.length === 0 || v.some((s) => !todas.includes(s))) throw new ErrorArgumentos(`${nombre} inválido: ${x}`);
    return v;
  };
  const entero = (x, def, min, max, nombre) => {
    if (x === undefined) return def;
    const n = Number(x);
    if (!Number.isInteger(n) || n < min || n > max) throw new ErrorArgumentos(`${nombre} inválido: ${x}`);
    return n;
  };
  return {
    clases: lista(o.clases, CLASES, "--clases"),
    tipos: lista(o.tipos, TIPOS, "--tipos"),
    muestras: entero(o.muestras, MUESTRAS_POR_DEFECTO, 1, 100_000, "--muestras"),
    semillaInicial: entero(o["semilla-inicial"], 1, 0, 2 ** 31, "--semilla-inicial"),
    frames: entero(o.frames, 3, 1, 5, "--frames"),
  };
}

/** PNG RGBA de un frame; determinista. */
export function codificarPng(frame) {
  const png = new PNG({ width: frame.width, height: frame.height });
  png.data = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  return PNG.sync.write(png, { colorType: 6 });
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Valida el manifiesto: raíz y entradas con `sintetico: true`, sin claves de datos personales. */
export function validarManifiesto(m) {
  if (m === null || typeof m !== "object" || m.sintetico !== true || !Array.isArray(m.entradas)) return { ok: false, motivo: "raiz" };
  for (const e of m.entradas) {
    if (e === null || typeof e !== "object" || e.sintetico !== true) return { ok: false, motivo: "entrada-no-sintetica" };
    for (const k of Object.keys(e)) if (CLAVES_PROHIBIDAS.has(k)) return { ok: false, motivo: `clave-prohibida:${k}` };
    if (!Array.isArray(e.archivos)) return { ok: false, motivo: "archivos" };
  }
  return { ok: true };
}
