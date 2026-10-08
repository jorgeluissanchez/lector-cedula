/**
 * OFF-28 (a) de pwa-lectura-offline y CAM-07 modificado: foto de alta resolución para el frame de lectura de la
 * amarilla con `ImageCapture.takePhoto`, a la máxima resolución de `getPhotoCapabilities`, con un límite de tiempo.
 * La foto se decodifica en memoria (`createImageBitmap`) y nunca se guarda ni se codifica. `null` si no hay foto: quien
 * llama usa el frame del vídeo. Nunca lanza.
 */
import type { FrameCompleto } from "./frames.js";

export type OrigenFrame = "takePhoto" | "video";

export interface FrameLectura extends FrameCompleto {
  readonly origen: OrigenFrame;
}

interface Rango {
  readonly max?: number;
}

interface ImageCaptureMinima {
  takePhoto?: (ajustes?: { imageWidth: number; imageHeight: number }) => Promise<Blob>;
  getPhotoCapabilities?: () => Promise<{ imageWidth?: Rango; imageHeight?: Rango }>;
}

export interface EntornoFoto {
  /** `globalThis.ImageCapture` (ausente en Firefox y Safari). */
  readonly ImageCapture?: new (pista: MediaStreamTrack) => unknown;
  /** Decodifica el blob en memoria y lo dibuja con el lado mayor <= `ladoMax`. */
  readonly aPixeles: (foto: Blob, ladoMax: number) => Promise<FrameCompleto>;
  /** Límite de la foto en ms; por defecto 3000. */
  readonly limiteMs?: number;
}

export const LIMITE_FOTO_MS = 3000;
export const LADO_MAX_FOTO = 4096;

function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promesa,
    new Promise<never>((_, rechazar) => {
      t = setTimeout(() => rechazar(new Error("tiempo")), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

async function ajustesMaximos(ic: ImageCaptureMinima): Promise<{ imageWidth: number; imageHeight: number } | undefined> {
  if (typeof ic.getPhotoCapabilities !== "function") return undefined;
  try {
    const c = await ic.getPhotoCapabilities();
    const w = c.imageWidth?.max;
    const h = c.imageHeight?.max;
    return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? { imageWidth: w, imageHeight: h } : undefined;
  } catch {
    return undefined;
  }
}

export async function tomarFoto(pista: MediaStreamTrack, entorno: EntornoFoto): Promise<FrameLectura | null> {
  const Constructor = entorno.ImageCapture;
  if (Constructor === undefined) return null;
  const limite = entorno.limiteMs ?? LIMITE_FOTO_MS;
  let vencida = false;
  try {
    const ic = new Constructor(pista) as ImageCaptureMinima;
    const takePhoto = ic.takePhoto;
    if (typeof takePhoto !== "function") return null;
    const frame = await conLimite(
      (async () => {
        const ajustes = await ajustesMaximos(ic);
        const foto = await takePhoto.call(ic, ajustes);
        const f = await entorno.aPixeles(foto, LADO_MAX_FOTO);
        // Una foto que llega después del límite se descarta con sus bytes a cero (OFF-11).
        if (vencida) f.pixeles.fill(0);
        return f;
      })(),
      limite,
    ).catch((e: unknown) => {
      vencida = true;
      throw e;
    });
    return { ancho: frame.ancho, alto: frame.alto, pixeles: frame.pixeles, origen: "takePhoto" };
  } catch {
    return null;
  }
}

/** Decodificador de navegador: `createImageBitmap` y un canvas temporal, con el lienzo vaciado al terminar. */
export async function fotoAPixeles(foto: Blob, ladoMax: number): Promise<FrameCompleto> {
  const mapa = await createImageBitmap(foto);
  try {
    const f = Math.min(1, ladoMax / Math.max(mapa.width, mapa.height));
    const ancho = Math.max(1, Math.round(mapa.width * f));
    const alto = Math.max(1, Math.round(mapa.height * f));
    const lienzo = new OffscreenCanvas(ancho, alto);
    const ctx = lienzo.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(mapa, 0, 0, ancho, alto);
    const pixeles = ctx.getImageData(0, 0, ancho, alto).data;
    // El lienzo no conserva la foto (principio III).
    ctx.clearRect(0, 0, ancho, alto);
    lienzo.width = 0;
    lienzo.height = 0;
    return { ancho, alto, pixeles };
  } finally {
    mapa.close();
  }
}
