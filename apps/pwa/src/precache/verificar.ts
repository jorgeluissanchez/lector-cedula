// Verificación de integridad de cada recurso de la precaché (OFF-02; design.md, decisión 7). Tamaño y SHA-256 con
// `crypto.subtle` (navegador, service worker y Node). En un fallo solo se informa la ruta, nunca el contenido.

export interface EntradaManifiesto {
  readonly ruta: string;
  readonly bytes: number;
  /** 64 caracteres hexadecimales en minúsculas. */
  readonly sha256: string;
}

export type ResultadoVerificacion = { readonly ok: true } | { readonly ok: false; readonly motivo: "integridad-fallida"; readonly ruta: string };

const HEX64 = /^[0-9a-f]{64}$/u;

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verificarEntrada(entrada: EntradaManifiesto, datos: ArrayBuffer | Uint8Array): Promise<ResultadoVerificacion> {
  const fallo: ResultadoVerificacion = { ok: false, motivo: "integridad-fallida", ruta: entrada.ruta };
  if (!HEX64.test(entrada.sha256) || datos.byteLength !== entrada.bytes) return fallo;
  const digest = await crypto.subtle.digest("SHA-256", datos as BufferSource);
  return hex(digest) === entrada.sha256 ? { ok: true } : fallo;
}
