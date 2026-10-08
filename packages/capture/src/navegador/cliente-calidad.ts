/**
 * Cliente del Worker de calidad en el hilo principal (CAL-09; design.md, decisión 6). Transfiere el buffer del frame
 * sin copia y recibe el mismo buffer de vuelta para reutilizarlo. La app construye el `Worker` y se lo pasa: el
 * paquete no sabe nada del empaquetador.
 */
import type { DeteccionDocumento, FrameAnalisis, ResultadoCalidad } from "../calidad/tipos.js";
import type { ResultadoConfiguracion } from "../calidad/umbrales.js";
import type { CodigoErrorWorker, ContenidoPresencia, MensajeDelWorker } from "./protocolo.js";

/** Lo mínimo de `Worker` que usa el cliente. */
export interface PuertoWorker {
  postMessage(mensaje: unknown, transferir: Transferable[]): void;
  addEventListener(tipo: "message", oyente: (e: MessageEvent<MensajeDelWorker>) => void): void;
  addEventListener(tipo: "error", oyente: () => void): void;
  terminate(): void;
}

export type RespuestaAnalisis =
  | {
      readonly ok: true;
      readonly resultado: ResultadoCalidad;
      readonly deteccion: DeteccionDocumento;
      /** El buffer enviado, devuelto por el Worker. */
      readonly pixeles: Uint8ClampedArray;
      /** OFF-27: pista de tipo para la lectura. */
      readonly contenido: ContenidoPresencia;
    }
  | { readonly ok: false; readonly codigo: CodigoErrorWorker };

export interface ClienteCalidad {
  /** Transfiere `frame.pixeles.buffer`: tras la llamada queda con `byteLength` 0. */
  analizar(frame: FrameAnalisis): Promise<RespuestaAnalisis>;
  configurar(umbrales: unknown): Promise<ResultadoConfiguracion>;
  /** Termina el Worker; las peticiones pendientes se resuelven con `mensaje-invalido`. */
  terminar(): void;
}

export function crearClienteCalidad(worker: PuertoWorker): ClienteCalidad {
  let siguienteId = 0;
  const pendientes = new Map<number, (m: MensajeDelWorker | null) => void>();

  const fallarTodo = (): void => {
    for (const resolver of pendientes.values()) resolver(null);
    pendientes.clear();
  };

  worker.addEventListener("message", (e: MessageEvent<MensajeDelWorker>) => {
    const resolver = pendientes.get(e.data.id);
    if (resolver === undefined) return;
    pendientes.delete(e.data.id);
    resolver(e.data);
  });
  worker.addEventListener("error", fallarTodo);

  function enviar(mensaje: Record<string, unknown>, transferir: Transferable[]): Promise<MensajeDelWorker | null> {
    const id = siguienteId++;
    return new Promise((resolve) => {
      pendientes.set(id, resolve);
      worker.postMessage({ ...mensaje, id }, transferir);
    });
  }

  return {
    async analizar(frame) {
      const pixeles = frame.pixeles.buffer as ArrayBuffer;
      const { ancho, alto, anchoOriginal, altoOriginal } = frame;
      const m = await enviar({ tipo: "analizar", ancho, alto, anchoOriginal, altoOriginal, pixeles }, [pixeles]);
      if (m?.tipo === "resultado") return { ok: true, resultado: m.resultado, deteccion: m.deteccion, pixeles: new Uint8ClampedArray(m.pixeles), contenido: m.contenido ?? null };
      return { ok: false, codigo: m?.tipo === "error" ? m.codigo : "mensaje-invalido" };
    },
    async configurar(umbrales) {
      const m = await enviar({ tipo: "configurar", umbrales }, []);
      return m?.tipo === "configurado" ? m.resultado : { ok: false, codigo: "umbrales-invalidos", campos: [] };
    },
    terminar() {
      worker.terminate();
      fallarTodo();
    },
  };
}
