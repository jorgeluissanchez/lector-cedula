// Escenas de cédula SINTÉTICA para la cámara simulada (pwa-lectura-offline, tarea 1.2; design.md, decisión 13).
// Fuentes: PDF417 de `generarPdf417(PERSONA_BASE, { semilla: 1 })` con el helper de las pruebas y reverso MRZ TD1 de
// `generarMrzTd1(PERSONA_BASE, { semilla: 1 })` renderizado por evals/sinteticos/render-mrz.mjs. Se colocan en la guía
// de CAM-08 (x 190, y 54, 1541x972) sobre fondo gris. Ningún dato real; las PNG solo existen en memoria o en un
// temporal fuera del repositorio que borra el generador.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { crearRenderizador } from "../../evals/sinteticos/render-mrz.mjs";
import { imagenSintetica } from "../../packages/capture/test/pdf417/sintetica.ts";

const GUIA = { x: 190, y: 54, ancho: 1541, alto: 972 };
const FONDO = "color=c=0x303030:s=1920x1080:r=10[f]";

/** Filtro de ffmpeg: la entrada 0 es la PNG fuente (en bucle); sale la escena 1920x1080. */
const enGuia = `${FONDO};[0:v]scale=${GUIA.ancho}:${GUIA.alto},format=yuv420p[t];[f][t]overlay=${GUIA.x}:${GUIA.y}:shortest=1`;
const giradaEnGuia = `${FONDO};[0:v]transpose=1,scale=-2:${GUIA.alto},format=yuv420p[t];[f][t]overlay=(W-w)/2:${GUIA.y}:shortest=1`;

export const ESCENAS_CEDULA = [
  { nombre: "amarilla-1080p", fuente: "amarilla", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "digital-1080p", fuente: "digital", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "digital-girada-90-1080p", fuente: "digital", filtro: giradaEnGuia, ancho: 1920, alto: 1080 },
];

/** PNG sintéticos de PERSONA_BASE (semilla 1): `amarilla` (PDF417) y `digital` (reverso con MRZ). */
export async function fuentesCedula() {
  const pdf417 = generarPdf417(PERSONA_BASE, { semilla: 1 });
  const mrz = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
  const amarilla = await imagenSintetica(pdf417.bytes);
  const render = await crearRenderizador();
  try {
    const digital = (await render.render(mrz.lineas)).bytes;
    return { amarilla, digital, lineasMrz: mrz.lineas, nuip: PERSONA_BASE.nuip };
  } finally {
    await render.cerrar();
  }
}
