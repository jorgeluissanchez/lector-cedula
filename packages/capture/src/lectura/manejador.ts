// Manejador puro del Worker lector (OFF-06, OFF-11, OFF-14; design.md, decisión 1). Recibe el ArrayBuffer RGBA
// transferido, lee con `leerDocumento` y responde el resultado (enmascarado salvo con `enmascarar: false`, OFF-09). Pone a cero los píxeles recibidos en
// todas las ramas (los bytes del PDF417 los pone a cero `leerDocumento`). `cancelar` aborta la lectura de ese id.
import { leerDocumento } from "./leer.js";
import type { DependenciasLectura, OpcionesLectura, PistaLectura, ResultadoLectura } from "./tipos.js";

const PISTAS: readonly PistaLectura[] = ["pdf417", "mrz", "mrz-td1", "mrz-td3"];

/** OFF-27 y OD-20: solo `"pdf417"`, `"mrz"`, `"mrz-td1"` y `"mrz-td3"` son pistas; cualquier otro valor equivale a no tenerla. */
function opcionesPista(m: MensajeLeer): Pick<OpcionesLectura, "pista" | "respaldo" | "respaldoDe"> {
  const pista = PISTAS.find((p) => p === m.pista);
  // OFF-27c: solo `respaldoDe: "pdf417"` reduce el presupuesto MRZ; otro valor se ignora.
  const de = m.respaldoDe === "pdf417" ? { respaldoDe: "pdf417" as const } : {};
  return pista === undefined ? de : { pista, ...(m.respaldo === false ? { respaldo: false } : {}), ...de };
}

export interface MensajeLeer {
  readonly tipo: "leer";
  readonly id: number;
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: ArrayBuffer;
  readonly fechaReferencia: string;
  /** OFF-27: contenido que vio la presencia; otro valor se ignora. */
  readonly pista?: unknown;
  /** OFF-28: `false` desactiva el respaldo del otro lector. */
  readonly respaldo?: unknown;
  /** OFF-27c: `"pdf417"` marca el respaldo MRZ de una pista PDF417; otro valor se ignora. */
  readonly respaldoDe?: unknown;
  /** OD-30a: solo `true` admite la TI y los menores; otro valor equivale a `false`. */
  readonly admitirTarjetaIdentidad?: unknown;
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

function esLeer(
  m: Record<string, unknown>,
): m is Record<string, unknown> & MensajeLeer {
  return (
    m.tipo === "leer" &&
    Number.isInteger(m.id) &&
    Number.isInteger(m.ancho) &&
    Number.isInteger(m.alto) &&
    m.pixeles instanceof ArrayBuffer &&
    typeof m.fechaReferencia === "string"
  );
}

export interface OpcionesManejador {
  /** OFF-09: `false` en la PWA (datos completos); por defecto `true`. */
  readonly enmascarar?: boolean;
}

export function crearManejadorLector(
  deps: DependenciasLectura,
  opciones: OpcionesManejador = {},
): (mensaje: unknown) => Promise<RespuestaLector | null> {
  const enmascarar = opciones.enmascarar ?? true;
  const enCurso = new Map<number, AbortController>();

  async function leer(m: MensajeLeer): Promise<RespuestaLector> {
    const data = new Uint8ClampedArray(m.pixeles);
    const control = new AbortController();
    enCurso.set(m.id, control);
    try {
      if (m.ancho <= 0 || m.alto <= 0 || data.length !== m.ancho * m.alto * 4)
        return {
          tipo: "resultado",
          id: m.id,
          resultado: { ok: false, error: "entrada-invalida" },
        };
      const resultado = await leerDocumento(
        { data, width: m.ancho, height: m.alto },
        deps,
        {
          fechaReferencia: m.fechaReferencia,
          senal: control.signal,
          enmascarar,
          ...opcionesPista(m),
          ...(m.admitirTarjetaIdentidad === true ? { admitirTarjetaIdentidad: true } : {}),
        },
      ).catch((): ResultadoLectura => ({ ok: false, error: "motor" }));
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
    // Stryker disable next-line ConditionalExpression: equivalente; sobre otro valor, `new Uint8Array` crea una copia y no toca el original.
    if (m.pixeles instanceof ArrayBuffer) new Uint8Array(m.pixeles).fill(0);
    return null;
  };
}
