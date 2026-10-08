/**
 * Worker de calidad (CAL-09; design.md, decisión 6). Solo añade transporte a `analizarFrame`: recibe el frame por
 * transferencia, obtiene el cuadrilátero del detector inyectado (CAL-14) y devuelve el mismo buffer transferido. En un error el buffer recibido se descarta (respuesta literal de CAL-09).
 * Nunca lanza hacia fuera y no guarda referencias a frames entre mensajes (principio III).
 */
import { detectarPresencia, evaluarConPresencia } from "../calidad/presencia.js";
import { analizarFrame } from "../calidad/score.js";
import { crearConfiguracionUmbrales } from "../calidad/umbrales.js";
import type { DetectorDocumento } from "../interfaces.js";
import type { MensajeDelWorker } from "./protocolo.js";

/** Alcance mínimo del Worker (evita depender de la combinación de `lib` DOM y WebWorker). */
export interface AlcanceWorker {
  onmessage: ((evento: MessageEvent<unknown>) => void) | null;
  postMessage(mensaje: MensajeDelWorker, transferir: Transferable[]): void;
}

type Registro = Record<string, unknown>;

const esRegistro = (v: unknown): v is Registro => typeof v === "object" && v !== null;
const dimensionValida = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** OFF-22 (pwa-lectura-offline): con `presencia`, un frame sin cédula en la guía nunca llega al umbral de `listo`. */
export interface OpcionesWorkerCalidad {
  readonly presencia?: boolean;
}

export function iniciarWorkerCalidad(alcance: AlcanceWorker, detector: DetectorDocumento, opciones: OpcionesWorkerCalidad = {}): void {
  const configuracion = crearConfiguracionUmbrales();
  // Procesa en orden aunque el detector sea asíncrono.
  let cola: Promise<void> = Promise.resolve();

  const responder = (m: MensajeDelWorker, pixeles: unknown): void => {
    alcance.postMessage(m, pixeles instanceof ArrayBuffer ? [pixeles] : []);
  };

  async function atender(datos: unknown): Promise<void> {
    const id = esRegistro(datos) && Number.isInteger(datos["id"]) ? (datos["id"] as number) : -1;
    const pixeles = esRegistro(datos) ? datos["pixeles"] : undefined;
    const error = (codigo: "frame-invalido" | "cuadrilatero-invalido" | "mensaje-invalido"): void => {
      responder({ tipo: "error", id, codigo }, undefined);
    };
    try {
      if (!esRegistro(datos) || id === -1) return error("mensaje-invalido");
      if (datos["tipo"] === "configurar") {
        return responder({ tipo: "configurado", id, resultado: configuracion.configurar(datos["umbrales"]) }, undefined);
      }
      if (datos["tipo"] !== "analizar") return error("mensaje-invalido");
      const { ancho, alto, anchoOriginal, altoOriginal } = datos;
      if (
        !(pixeles instanceof ArrayBuffer) ||
        !dimensionValida(ancho) ||
        !dimensionValida(alto) ||
        !dimensionValida(anchoOriginal) ||
        !dimensionValida(altoOriginal) ||
        pixeles.byteLength !== ancho * alto * 4
      ) {
        return error("frame-invalido");
      }
      const frame = { ancho, alto, anchoOriginal, altoOriginal, pixeles: new Uint8ClampedArray(pixeles) };
      const deteccion = await detector.detectar(frame);
      const r = analizarFrame(frame, deteccion, configuracion.umbrales);
      if (!r.ok) return error(r.codigo);
      // OFF-22 y OFF-25: la presencia solo se busca si el frame supera el umbral o solo le falta nitidez.
      const cuadrilatero = deteccion.cuadrilatero;
      const resultado =
        opciones.presencia === true && cuadrilatero !== null
          ? evaluarConPresencia(r.resultado, () => detectarPresencia(frame, cuadrilatero).presente, configuracion.umbrales.umbralListo)
          : r.resultado;
      responder({ tipo: "resultado", id, resultado, deteccion, pixeles }, pixeles);
    } catch {
      error("mensaje-invalido");
    }
  }

  alcance.onmessage = (evento) => {
    cola = cola.then(() => atender(evento.data));
  };
}
