#!/usr/bin/env node
// Fixtures MRZ del diferencial nativo (sdk-nativo, NAT-06, tarea 1.5). fixture-sintetico: reverso de PERSONA_BASE
// (NUIP 9999123456, generarMrzTd1 semilla 1) y el pasaporte sintético de OD-01, renderizados con OCR-B de prueba por
// evals/sinteticos/render-mrz.mjs y colocados en una escena 1920x1080 como los vídeos de e2e/videos (guía de CAM-08,
// fondo 0x303030, luminancia acotada a 40-200). Las mismas escenas las leen las pruebas Kotlin (`KJ`, OCR nativo) y
// `packages/nucleo-js/test/nat-06-diferencial-mrz.test.ts` (`CT`, packages/capture con Tesseract.js). Ningún dato real.
// Salida (ignorada por git): <salida>/<nombre>.rgba (RGBA crudo) y <salida>/casos.json.
// Uso: node tools/nativo/fixtures-mrz.mjs [--salida native/android/build/fixtures-mrz]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SALIDA_POR_DEFECTO = join(RAIZ, "native", "android", "build", "fixtures-mrz");

export const ANCHO = 1920;
export const ALTO = 1080;
/** Guía de CAM-08 en 1920x1080 (la de e2e/videos/cedulas.mjs). */
export const GUIA = Object.freeze({ x: 190, y: 54, ancho: 1541, alto: 972 });
const FONDO = 0x30;
const MINIMO = 40;
const MAXIMO = 200;

/** Pasaporte colombiano sintético de OD-01 (el de e2e/videos/cedulas.mjs). */
export const LINEAS_PASAPORTE = Object.freeze(["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"]);

/** Copia girada 90 grados en sentido horario (`transpose=1` de ffmpeg). */
export function girarHorario(p) {
  const { width: w, height: h } = p;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < h; x++) data.set(p.data.subarray(((h - 1 - x) * w + y) * 4, ((h - 1 - x) * w + y) * 4 + 4), (y * h + x) * 4);
  return { data, width: h, height: w };
}

/** Copia girada 180 grados. */
export function girar180(p) {
  const n = p.width * p.height;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) data.set(p.data.subarray((n - 1 - i) * 4, (n - i) * 4), i * 4);
  return { data, width: p.width, height: p.height };
}

/**
 * Escena `ANCHO` x `ALTO` con fondo gris y `tarjeta` escalada (bilineal, centros de píxel) al rectángulo `r`, con cada
 * canal acotado a 40-200 como el `lutyuv` de los vídeos sintéticos. Opaca.
 */
export function escena(tarjeta, r) {
  const data = new Uint8ClampedArray(ANCHO * ALTO * 4);
  for (let i = 0; i < ANCHO * ALTO; i++) data.set([FONDO, FONDO, FONDO, 255], i * 4);
  const fx = tarjeta.width / r.ancho;
  const fy = tarjeta.height / r.alto;
  for (let y = 0; y < r.alto; y++) {
    const sy = Math.min(tarjeta.height - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(tarjeta.height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < r.ancho; x++) {
      const sx = Math.min(tarjeta.width - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(tarjeta.width - 1, x0 + 1);
      const tx = sx - x0;
      const o = ((r.y + y) * ANCHO + r.x + x) * 4;
      for (let k = 0; k < 3; k++) {
        const v = (a, b) => tarjeta.data[(a * tarjeta.width + b) * 4 + k];
        const c = (v(y0, x0) * (1 - tx) + v(y0, x1) * tx) * (1 - ty) + (v(y1, x0) * (1 - tx) + v(y1, x1) * tx) * ty;
        data[o + k] = Math.min(MAXIMO, Math.max(MINIMO, Math.round(c)));
      }
    }
  }
  return { data, width: ANCHO, height: ALTO };
}

/** Rectángulo de alto `GUIA.alto` centrado horizontalmente para una tarjeta de proporción `ancho / alto`. */
export function centrada(ancho, alto) {
  const w = Math.round((GUIA.alto * ancho) / alto / 2) * 2;
  return { x: Math.round((ANCHO - w) / 2), y: GUIA.y, ancho: w, alto: GUIA.alto };
}

/** Escenas de NAT-06 a partir de los reversos ya renderizados (RGBA). */
export function escenas(digital, pasaporte, lineasDigital) {
  const normal = escena(digital, GUIA);
  const horario = girarHorario(digital);
  const antihorario = girar180(horario);
  return [
    { nombre: "digital-1080p", formato: "td1", lineas: lineasDigital, imagen: normal },
    { nombre: "digital-girada-90-1080p", formato: "td1", lineas: lineasDigital, imagen: escena(horario, centrada(horario.width, horario.height)) },
    { nombre: "digital-girada-180-1080p", formato: "td1", lineas: lineasDigital, imagen: girar180(normal) },
    { nombre: "digital-girada-270-1080p", formato: "td1", lineas: lineasDigital, imagen: escena(antihorario, centrada(antihorario.width, antihorario.height)) },
    { nombre: "pasaporte-1080p", formato: "td3", lineas: [...LINEAS_PASAPORTE], imagen: escena(pasaporte, centrada(pasaporte.width, pasaporte.height)) },
  ];
}

/** Escribe `<nombre>.rgba` y `casos.json` en `salida`. Devuelve la lista de casos. */
export function escribir(salida, lista) {
  mkdirSync(salida, { recursive: true });
  const casos = lista.map(({ nombre, formato, lineas, imagen }) => {
    writeFileSync(join(salida, `${nombre}.rgba`), imagen.data);
    return { nombre, archivo: `${nombre}.rgba`, ancho: imagen.width, alto: imagen.height, formato, lineas };
  });
  writeFileSync(join(salida, "casos.json"), `${JSON.stringify({ fechaReferencia: "2026-10-09", casos }, null, 2)}\n`);
  return casos;
}

async function main() {
  const i = process.argv.indexOf("--salida");
  const salida = i >= 0 ? resolve(process.argv[i + 1]) : SALIDA_POR_DEFECTO;
  const { PERSONA_BASE, generarMrzTd1 } = await import("@lector-cedula/fixtures");
  const { PNG } = (await import("pngjs")).default;
  const jpeg = (await import("jpeg-js")).default;
  const { crearRenderizador, DISTORSIONES } = await import("../../evals/sinteticos/render-mrz.mjs");
  const mrz = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
  const render = await crearRenderizador();
  try {
    const rgba = async (lineas, opciones) => {
      const bytes = Buffer.from((await render.render(lineas, opciones)).bytes);
      const img = bytes[0] === 0xff && bytes[1] === 0xd8 ? jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true }) : PNG.sync.read(bytes);
      return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
    };
    const lineas = [...mrz.lineas];
    // Conjunto E del eval mrz-imagen (evals/sinteticos): reverso limpio, sus 9 distorsiones y la foto F, para PERSONA_BASE.
    const conjuntoE = [
      { nombre: "reverso", formato: "td1", lineas, imagen: await rgba(lineas) },
      ...(await Promise.all(DISTORSIONES.map(async (d) => ({ nombre: `reverso-${d}`, formato: "td1", lineas, imagen: await rgba(lineas, { distorsion: d, semillaRuido: 1 }) })))),
      { nombre: "reverso-foto", formato: "td1", lineas, imagen: await rgba(lineas, { foto: true }) },
    ];
    const casos = escribir(salida, [...escenas(conjuntoE[0].imagen, await rgba(LINEAS_PASAPORTE), lineas), ...conjuntoE]);
    process.stdout.write(`fixtures MRZ (${casos.length}): ${salida}\n`);
  } finally {
    await render.cerrar();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
