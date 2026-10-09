/**
 * Copia de apps/pwa/src/lectura.ts (la PWA pasa a usar esta al migrar, 3.6).
 * Cliente del Worker lector (pwa-lectura-offline, OFF-06, OFF-11, OFF-14). Envía una copia transferida de los píxeles
 * (la captura original la libera quien llama), cancela con `AbortSignal` mandando `cancelar` al Worker y resuelve
 * de inmediato, y convierte un error del Worker en `motor`. No guarda ningún resultado.
 */
import type { ResultadoLectura, TipoLectura } from "@lector-cedula/capture";

export interface PuertoLector {
  postMessage(mensaje: unknown, transferir?: Transferable[]): void;
  addEventListener(tipo: "message", f: (e: MessageEvent<unknown>) => void): void;
  addEventListener(tipo: "error", f: (e: Event) => void): void;
  terminate(): void;
}

export interface PixelesCaptura {
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: Uint8ClampedArray;
}

/** OFF-27 y OFF-28: pista de tipo y respaldo del otro lector. */
export interface OpcionesLecturaCliente {
  readonly pista?: TipoLectura;
  readonly respaldo?: boolean;
  /** OFF-27c: respaldo MRZ de una pista PDF417 (presupuesto corto en el Worker). */
  readonly respaldoDe?: "pdf417";
  /** OD-30a. */
  readonly admitirTarjetaIdentidad?: boolean;
}

export interface ClienteLector {
  leer(captura: PixelesCaptura, fechaReferencia: string, senal?: AbortSignal, opciones?: OpcionesLecturaCliente): Promise<ResultadoLectura>;
  terminar(): void;
}




export function crearClienteLector(puerto: PuertoLector): ClienteLector {
  const pendientes = new Map<number, (r: ResultadoLectura) => void>();
  let siguiente = 1;

  puerto.addEventListener("message", (e) => {
    const d = e.data as { tipo?: unknown; id?: unknown; resultado?: unknown } | null;
    if (typeof d !== "object" || d === null || d.tipo !== "resultado" || typeof d.id !== "number") return;
    const resolver = pendientes.get(d.id);
    pendientes.delete(d.id);
    resolver?.(d.resultado as ResultadoLectura);
  });
  puerto.addEventListener("error", () => {
    for (const resolver of pendientes.values()) resolver({ ok: false, error: "motor" });
    pendientes.clear();
  });

  return {
    leer(captura, fechaReferencia, senal, opciones = {}) {
      if (senal?.aborted === true) return Promise.resolve({ ok: false, error: "cancelada" });
      const id = siguiente++;
      const pixeles = new Uint8ClampedArray(captura.pixeles).buffer;
      return new Promise((resolver) => {
        pendientes.set(id, resolver);
        senal?.addEventListener(
          "abort",
          () => {
            if (!pendientes.delete(id)) return;
            puerto.postMessage({ tipo: "cancelar", id });
            resolver({ ok: false, error: "cancelada" });
          },
          { once: true },
        );
        const extra = {
          ...(opciones.pista === undefined ? {} : { pista: opciones.pista }),
          ...(opciones.respaldo === undefined ? {} : { respaldo: opciones.respaldo }),
          ...(opciones.respaldoDe === "pdf417" ? { respaldoDe: "pdf417" } : {}),
          ...(opciones.admitirTarjetaIdentidad === true ? { admitirTarjetaIdentidad: true } : {}),
        };
        puerto.postMessage({ tipo: "leer", id, ancho: captura.ancho, alto: captura.alto, pixeles, fechaReferencia, ...extra }, [pixeles]);
      });
    },
    terminar() {
      puerto.terminate();
    },
  };
}
