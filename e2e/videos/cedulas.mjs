// Escenas de cédula SINTÉTICA para la cámara simulada (pwa-lectura-offline, tarea 1.2; design.md, decisión 13).
// Fuentes: PDF417 de `generarPdf417(PERSONA_BASE, { semilla: 1 })` con el helper de las pruebas y reverso MRZ TD1 de
// `generarMrzTd1(PERSONA_BASE, { semilla: 1 })` renderizado por evals/sinteticos/render-mrz.mjs. Se colocan en la guía
// de CAM-08 (x 190, y 54, 1541x972) sobre fondo gris. Ningún dato real; las PNG solo existen en memoria o en un
// temporal fuera del repositorio que borra el generador.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { crearRenderizador } from "../../evals/sinteticos/render-mrz.mjs";
import { imagenSintetica } from "../../packages/capture/test/pdf417/sintetica.ts";

const GUIA = { x: 190, y: 54, ancho: 1541, alto: 972 };
// Luminancia acotada como en las escenas de captura: un blanco puro dispara el aviso de reflejo (CAL-04).
const SIN_REFLEJO = "lutyuv=y='clip(val,40,200)'";
const FONDO = "color=c=0x303030:s=1920x1080:r=10[f]";

/** Filtro de ffmpeg: la entrada 0 es la PNG fuente (en bucle); sale la escena 1920x1080. */
const enGuia = `${FONDO};[0:v]scale=${GUIA.ancho}:${GUIA.alto},${SIN_REFLEJO},format=yuv420p[t];[f][t]overlay=${GUIA.x}:${GUIA.y}:shortest=1`;
// mrz-giro-180: la digital al revés (hflip + vflip = 180 grados) en la guía.
const alRevesEnGuia = enGuia.replace("[0:v]scale=", "[0:v]hflip,vflip,scale=");
const giradaEnGuia = `${FONDO};[0:v]transpose=1,scale=-2:${GUIA.alto},${SIN_REFLEJO},format=yuv420p[t];[f][t]overlay=(W-w)/2:${GUIA.y}:shortest=1`;

// OFF-25: cámara de celular real (más suave que los vídeos nítidos): desenfoque y ruido temporal; la amarilla además
// con el contraste de la tarjeta al 20 %. Varianza del Laplaciano en el frame de análisis entre 27 y 152: pasa con los umbrales
// recalibrados de CAL-08 (tarea 5.8); con los anteriores (40/200) daba "Desenfocado".
const suave = (sigma, ruido) => `,gblur=sigma=${sigma},noise=alls=${ruido}:allf=t`;
const amarillaSuave = enGuia.replace(SIN_REFLEJO, `${SIN_REFLEJO},lutyuv=y='150+(val-150)*0.2'`) + suave(2.5, 4);
const digitalSuave = enGuia + suave(5, 8);

// otros-documentos (OD-23): página de datos del pasaporte (ID-3, 125x88 mm) con el alto de la guía, centrada.
const ANCHO_PASAPORTE = Math.round((GUIA.alto * 125) / 88 / 2) * 2;
const pasaporteEnGuia = `${FONDO};[0:v]scale=${ANCHO_PASAPORTE}:${GUIA.alto},${SIN_REFLEJO},format=yuv420p[t];[f][t]overlay=${(1920 - ANCHO_PASAPORTE) / 2}:${GUIA.y}:shortest=1`;
/** Pasaporte colombiano sintético de OD-01 (packages/parsers/test/ayudas/generador-mrz-icao.ts, PASAPORTE_COL). */
export const LINEAS_PASAPORTE_COL = ["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"];

const enGuia720 = `color=c=0x303030:s=1280x720:r=10[f];[0:v]scale=1028:648,${SIN_REFLEJO},format=yuv420p[t];[f][t]overlay=126:36:shortest=1`;
const completa = "[0:v]scale=1920:1080,format=yuv420p";

// sdk-integracion (SDK-64): vídeo VERTICAL 1080x1920 (celular de pie) con la cédula de pie (girada 90 grados) en la
// guía vertical que calcula el núcleo para un recuadro de 260x400 con object-fit: cover (x 69, y 213, 942x1494).
const GUIA_DE_PIE = { x: 69, y: 213, ancho: 942, alto: 1494 };
const dePieEnGuia = `color=c=0x303030:s=1080x1920:r=10[f];[0:v]transpose=1,scale=${GUIA_DE_PIE.ancho}:${GUIA_DE_PIE.alto},${SIN_REFLEJO},format=yuv420p[t];[f][t]overlay=${GUIA_DE_PIE.x}:${GUIA_DE_PIE.y}:shortest=1`;

export const ESCENAS_CEDULA = [
  { nombre: "amarilla-1080p", fuente: "amarilla", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "digital-1080p", fuente: "digital", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "digital-girada-90-1080p", fuente: "digital", filtro: giradaEnGuia, ancho: 1920, alto: 1080 },
  { nombre: "digital-girada-180-1080p", fuente: "digital", filtro: alRevesEnGuia, ancho: 1920, alto: 1080 },
  // OFF-22: la escena nítida de las pruebas de captura lleva la amarilla sintética; sin cédula nunca hay `listo`.
  { nombre: "nitida-1080p", fuente: "amarilla", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "nitida-720p", fuente: "amarilla", filtro: enGuia720, ancho: 1280, alto: 720 },
  { nombre: "sin-documento-1080p", fuente: "sin-documento", filtro: completa, ancho: 1920, alto: 1080 },
  { nombre: "tarjeta-ilegible-1080p", fuente: "ilegible", filtro: enGuia, ancho: 1920, alto: 1080 },
  { nombre: "amarilla-suave-1080p", fuente: "amarilla", filtro: amarillaSuave, ancho: 1920, alto: 1080 },
  { nombre: "digital-suave-1080p", fuente: "digital", filtro: digitalSuave, ancho: 1920, alto: 1080 },
  // otros-documentos (OD-23): pasaporte sintético en la guía.
  { nombre: "pasaporte-col-1080p", fuente: "pasaporte", filtro: pasaporteEnGuia, ancho: 1920, alto: 1080 },
  // otros-documentos (OD-34b, tarea 6.3): TI amarilla sintética de una persona menor (PERSONA_TI) en la guía.
  { nombre: "ti-amarilla-1080p", fuente: "ti-amarilla", filtro: enGuia, ancho: 1920, alto: 1080 },
  // sdk-integracion (SDK-64): cédulas de pie en vídeo vertical.
  { nombre: "amarilla-de-pie-vertical", fuente: "amarilla", filtro: dePieEnGuia, ancho: 1080, alto: 1920 },
  { nombre: "digital-de-pie-vertical", fuente: "digital", filtro: dePieEnGuia, ancho: 1080, alto: 1920 },
];

/**
 * otros-documentos (OD-34b): persona ficticia menor de edad para la TI amarilla (PDF417 con el mismo formato que la
 * cédula amarilla; la TI se reconoce por la edad, H10). 12 años en la fecha fija de las E2E (2026-10-06).
 */
export const PERSONA_TI = Object.freeze({ ...PERSONA_BASE, primerNombre: "MENOR", segundoNombre: "", fechaNacimiento: "2014-03-14", fechaVencimiento: "2032-03-14" });

function png(ancho, alto, valor) {
  const p = new PNG({ width: ancho, height: alto });
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const v = valor(x, y);
      const i = (y * ancho + x) * 4;
      p.data[i] = v;
      p.data[i + 1] = v;
      p.data[i + 2] = v;
      p.data[i + 3] = 255;
    }
  }
  return new Uint8Array(PNG.sync.write(p));
}

/** Pared con textura y una cara dibujada (geometría, no una persona), nítidas. */
function sinDocumento() {
  let a = 7;
  const r = () => ((a = (a * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  return png(1920, 1080, (x, y) => {
    const e = ((x - 960) / 300) ** 2 + ((y - 560) / 400) ** 2;
    if (e <= 1) {
      if (((x - 850) / 50) ** 2 + ((y - 480) / 25) ** 2 < 1 || ((x - 1070) / 50) ** 2 + ((y - 480) / 25) ** 2 < 1) return 30;
      if (((x - 960) / 110) ** 2 + ((y - 760) / 28) ** 2 < 1) return 90;
      return 170;
    }
    return x > 1600 && x < 1630 ? 60 : 130 + Math.round((r() - 0.5) * 50);
  });
}

/** Tarjeta 1011x638 con barras verticales aleatorias que no forman un PDF417 válido. */
function tarjetaIlegible() {
  let a = 11;
  const r = () => ((a = (a * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  const barras = Array.from({ length: 700 }, () => r() < 0.5);
  return png(1011, 638, (x, y) => (x >= 150 && x < 850 && y >= 200 && y < 440 && barras[x - 150] ? 0 : 255));
}

/** PNG sintéticos de PERSONA_BASE (semilla 1): `amarilla` (PDF417) y `digital` (reverso con MRZ); `pasaporte` de OD-01. */
export async function fuentesCedula() {
  const pdf417 = generarPdf417(PERSONA_BASE, { semilla: 1 });
  const mrz = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
  const amarilla = await imagenSintetica(pdf417.bytes);
  const render = await crearRenderizador();
  try {
    const digital = (await render.render(mrz.lineas)).bytes;
    const pasaporte = (await render.render(LINEAS_PASAPORTE_COL)).bytes;
    const tiAmarilla = await imagenSintetica(generarPdf417(PERSONA_TI, { semilla: 1 }).bytes);
    return { amarilla, digital, pasaporte, tiAmarilla, sinDocumento: sinDocumento(), ilegible: tarjetaIlegible(), lineasMrz: mrz.lineas, nuip: PERSONA_BASE.nuip };
  } finally {
    await render.cerrar();
  }
}
