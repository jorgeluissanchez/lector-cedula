// Escenas de la señal de fraude (cambio deteccion-fraude, tarea 5.1b): reverso a color de la amarilla SINTÉTICA con
// el PDF417 decodificable de PERSONA_BASE, auténtico y con dos ataques (foto de una pantalla y fotocopia en grises).
// Las dibuja `@lector-cedula/fraud/sintetico` (requiere `npm run build`) a la medida exacta de la guía (1541x972),
// así que ffmpeg no reescala y la rejilla de subpíxeles de la pantalla llega intacta. Ningún dato real.
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { pixelesSinteticos } from "../../packages/capture/test/pdf417/sintetica.ts";

const GUIA = { ancho: 1541, alto: 972 };
const SIN_REFLEJO = "lutyuv=y='clip(val,40,200)'";
const enGuia = `color=c=0x303030:s=1920x1080:r=10[f];[0:v]scale=${GUIA.ancho}:${GUIA.alto},${SIN_REFLEJO},format=yuv420p[t];[f][t]overlay=190:54:shortest=1`;

export const ESCENAS_FRAUDE = [
  { nombre: "amarilla-color-1080p", fuente: "fraude-autentica", clase: "autentica", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "amarilla-pantalla-1080p", fuente: "fraude-pantalla", clase: "pantalla", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "amarilla-fotocopia-1080p", fuente: "fraude-fotocopia", clase: "fotocopia-gris", filtro: enGuia, ancho: 1920, alto: 1080 },
];

/** PNG de cada escena: `{ [fuente]: bytes }`. */
export async function fuentesFraude() {
  const { generarEscena } = await import(new URL("../../packages/fraud/dist/sintetico/index.js", import.meta.url).href);
  const codigo = await pixelesSinteticos(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const salida = {};
  for (const e of ESCENAS_FRAUDE) {
    const escena = generarEscena({ tipo: "amarilla", clase: e.clase, semilla: 1, cara: "reverso", frames: 1, lienzo: GUIA, codigo });
    const f = escena.entrada.frames[0];
    const png = new PNG({ width: f.width, height: f.height });
    png.data = Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength);
    salida[e.fuente] = new Uint8Array(PNG.sync.write(png));
  }
  return salida;
}
