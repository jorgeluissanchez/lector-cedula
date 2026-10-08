// Manejador puro del Worker lector (OFF-06, OFF-11, OFF-14; design.md, decisión 1). Recibe el ArrayBuffer RGBA
// transferido, lee con `leerDocumento` y responde solo el resultado enmascarado. Pone a cero los píxeles recibidos en
// todas las ramas (los bytes del PDF417 los pone a cero `leerDocumento`). `cancelar` aborta la lectura de ese id.
import { leerDocumento } from "./leer.js";
import type { DependenciasLectura, ResultadoLectura } from "./tipos.js";

export interface MensajeLeer {
  readonly tipo: "leer";
  readonly id: number;
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: ArrayBuffer;
  readonly fechaReferencia: string;
}

export interface MensajeCancelar {
  readonly tipo: "cancelar";
  readonly id: number;
}

export type MensajeAlLector = MensajeLeer | MensajeCancelar;

export interface RespuestaLector {
  readonly tipo: "resultado";
  readonly id: number;
  readonly resultado: ResultadoLectura;
}

function esLeer(m: Record<string, unknown>): m is Record<string, unknown> & MensajeLeer {
  return m.tipo === "leer" && Number.isInteger(m.id) && Number.isInteger(m.ancho) && Number.isInteger(m.alto) && m.pixeles instanceof ArrayBuffer && typeof m.fechaReferencia === "string";
}

export function crearManejadorLector(deps: DependenciasLectura): (mensaje: unknown) => Promise<RespuestaLector | null> {
  const enCurso = new Map<number, AbortController>();

  async function leer(m: MensajeLeer): Promise<RespuestaLector> {
    const data = new Uint8ClampedArray(m.pixeles);
    const control = new AbortController();
    enCurso.set(m.id, control);
    try {
      if (m.ancho <= 0 || m.alto <= 0 || data.length !== m.ancho * m.alto * 4) return { tipo: "resultado", id: m.id, resultado: { ok: false, error: "entrada-invalida" } };
      const resultado = await leerDocumento({ data, width: m.ancho, height: m.alto }, deps, { fechaReferencia: m.fechaReferencia, senal: control.signal }).catch(
        (): ResultadoLectura => ({ ok: false, error: "motor" }),
      );
      return { tipo: "resultado", id: m.id, resultado };
    } finally {
      enCurso.delete(m.id);
      data.fill(0);
    }
  }

  return async (mensaje) => {
    if (typeof mensaje !== "object" || mensaje === null) return null;
    const m = mensaje as Record<string, unknown>;
    if (m.tipo === "cancelar") {
      enCurso.get(m.id as number)?.abort();
      return null;
    }
    if (esLeer(m)) return leer(m);
    // Un mensaje mal formado también pudo transferir píxeles: se ponen a cero antes de descartarlo (OFF-11).
    if (m.pixeles instanceof ArrayBuffer) new Uint8Array(m.pixeles).fill(0);
    return null;
  };
}
