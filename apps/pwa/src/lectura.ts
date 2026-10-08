/**
 * Cliente del Worker lector (pwa-lectura-offline, OFF-06, OFF-11, OFF-14). Envía una copia transferida de los píxeles
 * (la captura original la libera quien llama), cancela con `AbortSignal` mandando `cancelar` al Worker y resuelve
 * de inmediato, y convierte un error del Worker en `motor`. No guarda ningún resultado.
 */
import type { ResultadoLectura } from "@lector-cedula/capture";

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

export interface ClienteLector {
  leer(captura: PixelesCaptura, fechaReferencia: string, senal?: AbortSignal): Promise<ResultadoLectura>;
  terminar(): void;
}

export { PRESUPUESTO_MRZ_PWA } from "./presupuesto";

/** Worker real; Vite lo emite como `assets/lector.worker-<hash>.js`. */
export function nuevoWorkerLector(): Worker {
  return new Worker(new URL("./lector.worker.ts", import.meta.url), { type: "module" });
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
    leer(captura, fechaReferencia, senal) {
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
        puerto.postMessage({ tipo: "leer", id, ancho: captura.ancho, alto: captura.alto, pixeles, fechaReferencia }, [pixeles]);
      });
    },
    terminar() {
      puerto.terminate();
    },
  };
}
