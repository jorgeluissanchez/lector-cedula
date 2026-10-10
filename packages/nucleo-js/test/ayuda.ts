// Ayudas de las pruebas de @lector-cedula/nucleo-js (sdk-nativo, NAT-07): construye el bundle real una vez por archivo
// en un directorio temporal propio y lo evalúa en un contexto `node:vm` vacío (sin window, document, fetch ni XHR).
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
// @ts-expect-error: script .mjs sin tipos.
import { construirNucleo } from "../scripts/construir.mjs";

export interface ApiNucleo {
  readonly version: string;
  procesarPdf417(bytesBase64: unknown, opciones?: unknown): unknown;
  procesarMrz(lineas: unknown, opciones?: unknown): unknown;
  transicion(estado: unknown, evento: unknown): unknown;
  crearEstado(opciones?: unknown): unknown;
  validarOpciones(opciones: unknown): unknown;
  validarUrlSubida(url: unknown, servidor: unknown): unknown;
  decidirEnvio(salida: unknown, opciones: unknown): unknown;
}

let cache: Promise<string> | null = null;

/** Código del bundle IIFE construido con `scripts/construir.mjs`. */
export function codigoBundle(): Promise<string> {
  cache ??= (async () => {
    const dir = await mkdtemp(join(tmpdir(), "nucleo-js-prueba-"));
    try {
      const salida = join(dir, "nucleo.js");
      await construirNucleo({ salida });
      return await readFile(salida, "utf8");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  })();
  return cache;
}

/**
 * Contexto vm sin globals de navegador. `api` normaliza cada salida con JSON (los objetos del contexto vm tienen otros
 * prototipos, y así se exige además que la salida sea JSON); `crudo` es el objeto tal cual.
 */
export function evaluarEnVm(codigo: string): { api: ApiNucleo; crudo: ApiNucleo; contexto: Record<string, unknown> } {
  const contexto: Record<string, unknown> = {};
  createContext(contexto);
  runInContext(codigo, contexto, { filename: "nucleo.js" });
  const crudo = contexto["LectorCedulaNucleo"] as ApiNucleo;
  const api = Object.fromEntries(
    Object.entries(crudo).map(([k, v]) => [k, typeof v === "function" ? (...a: unknown[]) => json((v as (...x: unknown[]) => unknown)(...a)) : v]),
  ) as unknown as ApiNucleo;
  return { api, crudo, contexto };
}

/** Base64 de bytes con `Buffer` (oráculo independiente del decodificador del bundle). */
export const aBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

/** Copia JSON (los objetos de un contexto vm tienen otros prototipos). */
export const json = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** La API importada desde la fuente TypeScript (sin bundle), normalizada con JSON como `evaluarEnVm`. */
export async function apiFuente(): Promise<ApiNucleo> {
  const m = (await import("../src/nucleo.js")) as unknown as Record<string, unknown>;
  const nombres = ["procesarPdf417", "procesarMrz", "transicion", "crearEstado", "validarOpciones", "validarUrlSubida", "decidirEnvio"];
  const api: Record<string, unknown> = { version: m["VERSION"] };
  for (const n of nombres) api[n] = (...a: unknown[]) => json((m[n] as (...x: unknown[]) => unknown)(...a));
  return api as unknown as ApiNucleo;
}
