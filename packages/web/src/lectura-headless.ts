/**
 * `leerDocumento` headless (SDK-08): sin cámara ni DOM. Convierte la entrada en píxeles con `OffscreenCanvas`, lee con
 * el mismo Worker lector y devuelve el mismo resultado de presentación que `crearLector`. Se carga solo al llamarla.
 * Código de entorno (navegador): lo cubren las pruebas de Vitest browser.
 */
// Stryker disable all
import type { FrameLectura } from "@lector-cedula/capture";
import { entornoNavegador, motorMemorizado, recursosPorOmision } from "./cargador.js";
import type { ClienteLector } from "./cliente-lector.js";
import { codigoErrorLectura } from "./controlador.js";
import { abrirWorkerLector, hoyEnBogota } from "./dependencias.js";
import { mensaje } from "./mensajes.js";
import { aPresentacion } from "./presentacion.js";
import { leerSecuencia } from "./secuencia.js";
import type { CodigoError, ResultadoPresentacion, TipoDocumento } from "./tipos.js";

export type EntradaLectura = Blob | ImageBitmap | ImageData;

export interface OpcionesLeerDocumento {
  readonly recursos?: string;
  readonly documentos?: readonly TipoDocumento[];
  readonly admitirTi?: boolean;
  readonly senal?: AbortSignal;
}

const estaAbortada = (s: AbortSignal | undefined): boolean => s !== undefined && s.aborted;
const abortado = (): DOMException => new DOMException("Lectura cancelada", "AbortError");

function fallo(codigo: CodigoError): Error {
  return Object.assign(new Error(mensaje(codigo)), { codigo });
}

async function aPixeles(entrada: EntradaLectura): Promise<FrameLectura> {
  if (typeof ImageData !== "undefined" && entrada instanceof ImageData) {
    return { ancho: entrada.width, alto: entrada.height, pixeles: new Uint8ClampedArray(entrada.data), origen: "video" };
  }
  const mapa: ImageBitmap = entrada instanceof Blob ? await createImageBitmap(entrada) : (entrada as ImageBitmap);
  const lienzo = new OffscreenCanvas(mapa.width, mapa.height);
  const ctx = lienzo.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  try {
    ctx.drawImage(mapa, 0, 0);
    return { ancho: mapa.width, alto: mapa.height, pixeles: ctx.getImageData(0, 0, mapa.width, mapa.height).data, origen: "video" };
  } finally {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    lienzo.width = 1;
    lienzo.height = 1;
    if (entrada instanceof Blob) mapa.close();
  }
}

let compartido: ClienteLector | null = null;

export async function leerDocumentoHeadless(entrada: EntradaLectura, opciones: OpcionesLeerDocumento = {}): Promise<ResultadoPresentacion> {
  const senal = opciones.senal;
  if (estaAbortada(senal)) throw abortado();
  let frame: FrameLectura;
  try {
    frame = await aPixeles(entrada);
  } catch {
    throw fallo("lectura-fallida");
  }
  try {
    const motor = await motorMemorizado(opciones.recursos ?? recursosPorOmision(), entornoNavegador());
    if (estaAbortada(senal)) throw abortado();
    compartido ??= abrirWorkerLector(motor);
    const cliente = compartido;
    const control = new AbortController();
    const alAbortar = (): void => control.abort();
    senal?.addEventListener("abort", alAbortar, { once: true });
    const fecha = hoyEnBogota();
    try {
      const { resultado: r } = await leerSecuencia([frame], null, (f) => cliente.leer(f, fecha, control.signal, opciones.admitirTi === true ? { admitirTarjetaIdentidad: true } : {}), {
        ahora: () => performance.now(),
      });
      if (estaAbortada(senal)) throw abortado();
      if (!r.ok) throw fallo(codigoErrorLectura(r));
      if (opciones.documentos !== undefined && !opciones.documentos.includes(r.tipoDocumento)) throw fallo("documento-no-admitido");
      return aPresentacion(r);
    } finally {
      senal?.removeEventListener("abort", alAbortar);
    }
  } finally {
    frame.pixeles.fill(0);
  }
}
