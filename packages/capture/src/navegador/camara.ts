/**
 * Cámara trasera (CAM-03, CAM-04, CAM-06, CAM-10). Una sola llamada a `getUserMedia` con las restricciones exactas,
 * lectura de la resolución con `getSettings()`, enfoque continuo si la pista lo admite y parada de todas las pistas.
 */
import { avisoResolucion } from "../flujo/resolucion.js";

export const RESTRICCIONES_CAMARA = Object.freeze({
  audio: false,
  video: Object.freeze({ facingMode: Object.freeze({ ideal: "environment" }), width: Object.freeze({ ideal: 1920 }), height: Object.freeze({ ideal: 1080 }) }),
});

export interface Medios {
  getUserMedia(restricciones: MediaStreamConstraints): Promise<MediaStream>;
}

export interface Camara {
  readonly stream: MediaStream;
  readonly ancho: number;
  readonly alto: number;
  /** Aviso de CAM-04 si la resolución es baja; `null` si es suficiente. */
  readonly aviso: string | null;
  /** Detiene todas las pistas (CAM-10). */
  detener(): void;
}

async function enfocar(pista: MediaStreamTrack): Promise<void> {
  if (typeof pista.getCapabilities !== "function") return;
  const modos = (pista.getCapabilities() as { focusMode?: unknown }).focusMode;
  if (!Array.isArray(modos) || !modos.includes("continuous")) return;
  try {
    await pista.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
  } catch {
    // CAM-06: un rechazo no cambia la pantalla.
  }
}

export async function iniciarCamara(medios: Medios): Promise<Camara> {
  // Se pasa una copia mutable: el navegador no la modifica, pero el tipo de la API no admite objetos congelados.
  const stream = await medios.getUserMedia(structuredClone(RESTRICCIONES_CAMARA) as MediaStreamConstraints);
  const [pista] = stream.getVideoTracks();
  if (pista === undefined) {
    for (const p of stream.getTracks()) p.stop();
    throw new DOMException("sin pista de vídeo", "NotFoundError");
  }
  await enfocar(pista);
  const { width = 0, height = 0 } = pista.getSettings();
  return {
    stream,
    ancho: width,
    alto: height,
    aviso: avisoResolucion(width, height),
    detener() {
      for (const p of stream.getTracks()) p.stop();
    },
  };
}
