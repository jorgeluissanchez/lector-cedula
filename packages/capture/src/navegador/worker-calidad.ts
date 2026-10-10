/**
 * Worker de calidad (CAL-09; design.md, decisión 6). Solo añade transporte a `analizarFrame`: recibe el frame por
 * transferencia, obtiene el cuadrilátero del detector inyectado (CAL-14) y devuelve el mismo buffer transferido. En un error el buffer recibido se descarta (respuesta literal de CAL-09).
 * Nunca lanza hacia fuera y no guarda referencias a frames entre mensajes (principio III).
 */
import { detectarPresencia, evaluarConPresencia } from "../calidad/presencia.js";
import { analizarFrame } from "../calidad/score.js";
import { crearConfiguracionUmbrales } from "../calidad/umbrales.js";
import type { DetectorDocumento } from "../interfaces.js";
import type { ContenidoPresencia, ContenidoPresenciaTd, MensajeDelWorker } from "./protocolo.js";

/** Alcance mínimo del Worker (evita depender de la combinación de `lib` DOM y WebWorker). */
export interface AlcanceWorker {
  onmessage: ((evento: MessageEvent<unknown>) => void) | null;
  postMessage(mensaje: MensajeDelWorker, transferir: Transferable[]): void;
}

type Registro = Record<string, unknown>;

const esRegistro = (v: unknown): v is Registro => typeof v === "object" && v !== null;
const dimensionValida = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
type CajaGuia = { x: number; y: number; ancho: number; alto: number };
const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** SDK-61: guía opcional en píxeles del frame original; `null` si es inválida o sale del frame, `undefined` si falta. */
function guiaDe(v: unknown, anchoOriginal: number, altoOriginal: number): CajaGuia | null | undefined {
  if (v === undefined) return undefined;
  if (!esRegistro(v)) return null;
  const { x, y, ancho, alto } = v;
  if (!finito(x) || !finito(y) || !finito(ancho) || !finito(alto) || ancho <= 0 || alto <= 0) return null;
  if (x < 0 || y < 0 || x + ancho > anchoOriginal || y + alto > altoOriginal) return null;
  return { x, y, ancho, alto };
}

/** OFF-22 (pwa-lectura-offline): con `presencia`, un frame sin cédula en la guía nunca llega al umbral de `listo`. */
export interface OpcionesWorkerCalidad {
  readonly presencia?: boolean;
  /** OD-20: `true` envía `"mrz-td1"` y `"mrz-td3"`; sin él, la forma heredada (`"mrz"` y `null` para el TD3). */
  readonly contenidoTd?: boolean;
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
      const guia = guiaDe(datos["guia"], anchoOriginal, altoOriginal);
      if (guia === null) return error("frame-invalido");
      const frame = { ancho, alto, anchoOriginal, altoOriginal, pixeles: new Uint8ClampedArray(pixeles), ...(guia === undefined ? {} : { guia }) };
      const deteccion = await detector.detectar(frame);
      const r = analizarFrame(frame, deteccion, configuracion.umbrales);
      if (!r.ok) return error(r.codigo);
      // OFF-22 y OFF-25: la presencia solo se busca si el frame supera el umbral o solo le falta nitidez.
      // OFF-27: el contenido detectado viaja como pista de tipo; `null` si la presencia no se evaluó.
      const cuadrilatero = deteccion.cuadrilatero;
      let contenido: ContenidoPresencia | ContenidoPresenciaTd = null;
      const resultado =
        opciones.presencia === true && cuadrilatero !== null
          ? evaluarConPresencia(
              r.resultado,
              () => {
                const p = detectarPresencia(frame, cuadrilatero);
                contenido = opciones.contenidoTd === true ? p.contenido : p.contenido === "mrz-td1" ? "mrz" : p.contenido === "mrz-td3" ? null : p.contenido;
                return p.presente;
              },
              configuracion.umbrales.umbralListo,
            )
          : r.resultado;
      responder({ tipo: "resultado", id, resultado, deteccion, pixeles, contenido }, pixeles);
    } catch {
      error("mensaje-invalido");
    }
  }

  alcance.onmessage = (evento) => {
    cola = cola.then(() => atender(evento.data));
  };
}
