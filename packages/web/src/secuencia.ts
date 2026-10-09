/**
 * Copia de apps/pwa/src/secuencia.ts (la PWA pasa a usar esta al migrar, 3.6). OFF-28 (c): lectura sobre varios frames de la misma captura. Con pista, cada frame se lee solo con ese lector
 * (`respaldo: false`); para en el primero leído o con un error que no es "no encontrado" (OFF-13) y no empieza un
 * frame nuevo pasados `presupuestoMs` desde el primero. Si ninguno se lee, el respaldo de OFF-27 se hace una sola vez al
 * final sobre el primer frame con el otro lector. Sin pista, cada frame sigue el orden de OFF-06. Cada frame se pone a
 * cero tras su última lectura (el cliente copia los píxeles al Worker) y todos al terminar (OFF-11). Devuelve también
 * los pasos para el modo diagnóstico (OFF-29).
 */
import { clasificarErrorLectura, type FrameLectura, type OrigenFrame, type ResultadoLectura, type TipoLectura } from "@lector-cedula/capture";

export type { FrameLectura } from "@lector-cedula/capture";

export const PRESUPUESTO_FRAMES_MS = 8000;
export const MAX_FRAMES_LECTURA = 5;

export interface PasoSecuencia {
  readonly origen: OrigenFrame;
  readonly ancho: number;
  readonly alto: number;
  /** `ok:<tipo>:<intento>` o el código de error de `leerDocumento`. */
  readonly codigo: string;
  readonly ms: number;
}

export interface OpcionesSecuencia {
  readonly ahora: () => number;
  readonly presupuestoMs?: number;
}

/**
 * `respaldoDe` solo en la llamada final de respaldo de una pista PDF417 (OFF-27c: el Worker acota la MRZ a TD1 y 4
 * llamadas).
 */
/** Lee un frame con un solo lector (`respaldo: false`) o, con `null`, con el orden de OFF-06. */
export type LeerFrame = (frame: FrameLectura, lector: TipoLectura | null, respaldoDe?: TipoLectura) => Promise<ResultadoLectura>;

const NINGUNO: ResultadoLectura = { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" };

export function codigoResultado(r: ResultadoLectura): string {
  return r.ok ? `ok:${r.tipo}:${r.intento}` : r.error;
}

const noEncontrado = (r: ResultadoLectura): boolean => !r.ok && clasificarErrorLectura(r).codigo === "no-encontrado";

export async function leerSecuencia(
  frames: readonly FrameLectura[],
  pista: TipoLectura | null,
  leer: LeerFrame,
  opciones: OpcionesSecuencia,
): Promise<{ resultado: ResultadoLectura; pasos: PasoSecuencia[] }> {
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_FRAMES_MS;
  const pasos: PasoSecuencia[] = [];
  let resultado = NINGUNO;
  const inicio = opciones.ahora();
  const paso = async (frame: FrameLectura, lector: TipoLectura | null, ultima: boolean, respaldoDe?: TipoLectura): Promise<void> => {
    const t = opciones.ahora();
    const pendiente = respaldoDe === undefined ? leer(frame, lector) : leer(frame, lector, respaldoDe);
    if (ultima) frame.pixeles.fill(0);
    resultado = await pendiente;
    pasos.push({ origen: frame.origen, ancho: frame.ancho, alto: frame.alto, codigo: codigoResultado(resultado), ms: Math.round(opciones.ahora() - t) });
  };
  try {
    for (const [i, frame] of frames.entries()) {
      if (i > 0 && opciones.ahora() - inicio >= presupuesto) break;
      // Con pista, el primer frame se conserva para el respaldo final.
      await paso(frame, pista, pista === null || i > 0);
      if (!noEncontrado(resultado)) return { resultado, pasos };
    }
    const primero = frames[0];
    if (pista !== null && primero !== undefined) await (pista === "pdf417" ? paso(primero, "mrz", true, "pdf417") : paso(primero, "pdf417", true));
  } finally {
    for (const f of frames) f.pixeles.fill(0);
  }
  return { resultado, pasos };
}
