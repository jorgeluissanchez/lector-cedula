/**
 * Integridad de los recursos del motor (SDK-39; mismo criterio que OFF-02): SHA-256 con `crypto.subtle` antes de usar
 * o cachear. Puro salvo `crypto.subtle`.
 */

export interface EntradaRecurso {
  readonly archivo: string;
  readonly bytes: number;
  /** 64 caracteres hexadecimales en minúsculas. */
  readonly sha256: string;
  readonly tipo: string;
}

export interface ManifiestoRecursos {
  readonly version: string;
  readonly recursos: readonly EntradaRecurso[];
}

const HEX64 = /^[0-9a-f]{64}$/u;
const ARCHIVO = /^[A-Za-z0-9._-]+$/u;

export function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(datos: ArrayBuffer | Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", datos as BufferSource));
}

/** `true` solo si el tamaño y el SHA-256 coinciden con la entrada. */
export async function verificarRecurso(entrada: EntradaRecurso, datos: ArrayBuffer | Uint8Array): Promise<boolean> {
  if (!HEX64.test(entrada.sha256) || datos.byteLength !== entrada.bytes) return false;
  return (await sha256Hex(datos)) === entrada.sha256;
}

/** Valida la forma del manifiesto; `null` si no es válido (nombres sin rutas, hashes hex). */
export function leerManifiesto(v: unknown): ManifiestoRecursos | null {
  if (typeof v !== "object" || v === null) return null;
  const { version, recursos } = v as { version?: unknown; recursos?: unknown };
  if (typeof version !== "string" || !Array.isArray(recursos) || recursos.length === 0) return null;
  for (const r of recursos as unknown[]) {
    if (typeof r !== "object" || r === null) return null;
    const e = r as Record<string, unknown>;
    if (typeof e.archivo !== "string" || !ARCHIVO.test(e.archivo) || e.archivo.startsWith(".")) return null;
    if (typeof e.sha256 !== "string" || !HEX64.test(e.sha256)) return null;
    if (typeof e.bytes !== "number" || !Number.isInteger(e.bytes) || e.bytes < 0) return null;
    if (typeof e.tipo !== "string") return null;
  }
  return { version, recursos: recursos as EntradaRecurso[] };
}
