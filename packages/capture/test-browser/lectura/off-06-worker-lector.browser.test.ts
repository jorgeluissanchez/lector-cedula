// OFF-06, OFF-07 y OFF-10 en Chromium real (pwa-lectura-offline, tarea 3.1): Worker lector con zxing-wasm,
// tesseract.js y mrz.traineddata servidos desde el mismo origen (sin CDN). Imágenes SINTÉTICAS de PERSONA_BASE
// (semilla 1) generadas en memoria. Requiere `npm run modelos:mrz`.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { prepareZXingModule as prepararEscritor, writeBarcode } from "zxing-wasm/writer";
import urlEscritor from "zxing-wasm/writer/zxing_writer.wasm?url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import urlFuente from "../../../../evals/sinteticos/fuentes/OCRB.otf?url";
import type { RespuestaLector } from "../../src/lectura/manejador.js";

const FECHA = "2026-10-06";
let worker: Worker;
let siguienteId = 1;

function lienzo(ancho: number, alto: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(ancho, alto);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("sin 2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ancho, alto);
  return [c, ctx];
}

async function imagenCodigo(contenido: Uint8Array | string, formato: "PDF417" | "QRCode", ancho: number, alto: number, anchoCodigo: number): Promise<ImageData> {
  const escrito = await writeBarcode(contenido, { format: formato });
  if (escrito.image === null) throw new Error(escrito.error);
  const bitmap = await createImageBitmap(escrito.image);
  const [, ctx] = lienzo(ancho, alto);
  ctx.imageSmoothingEnabled = false;
  const altoCodigo = Math.round((bitmap.height * anchoCodigo) / bitmap.width);
  ctx.drawImage(bitmap, Math.floor((ancho - anchoCodigo) / 2), Math.floor((alto - altoCodigo) / 2), anchoCodigo, altoCodigo);
  return ctx.getImageData(0, 0, ancho, alto);
}

/** Reverso sintético R(L) (spec lectura-mrz-imagen, Convenciones). */
function reverso(lineas: readonly string[]): ImageData {
  const [, x] = lienzo(1011, 638);
  x.fillStyle = "#F2EFE6";
  x.fillRect(0, 0, 1011, 638);
  x.fillStyle = "#111111";
  x.font = "28px sans-serif";
  x.fillText("REPUBLICA DE COLOMBIA - DOCUMENTO SINTETICO", 40, 60);
  x.fillStyle = "#BBBBBB";
  x.fillRect(700, 120, 260, 260);
  x.fillStyle = "#111111";
  x.font = "36px 'OCRB-prueba'";
  lineas.forEach((l, i) => x.fillText(l, 40, 520 + 50 * i));
  return x.getImageData(0, 0, 1011, 638);
}

/** Gira la imagen 270° en sentido horario (90° antihorario). */
function girar270(img: ImageData): ImageData {
  const [origen, octx] = lienzo(img.width, img.height);
  octx.putImageData(img, 0, 0);
  const [, ctx] = lienzo(img.height, img.width);
  ctx.translate(0, img.width);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(origen, 0, 0);
  return ctx.getImageData(0, 0, img.height, img.width);
}

function leer(img: ImageData): Promise<RespuestaLector> {
  const id = siguienteId++;
  const pixeles = new Uint8ClampedArray(img.data).buffer;
  return new Promise((resolver, rechazar) => {
    const alFallar = () => rechazar(new Error("worker-lector: error de carga o ejecución"));
    const alRecibir = (e: MessageEvent<RespuestaLector>) => {
      if (e.data?.id !== id) return;
      worker.removeEventListener("message", alRecibir);
      worker.removeEventListener("error", alFallar);
      resolver(e.data);
    };
    worker.addEventListener("message", alRecibir);
    worker.addEventListener("error", alFallar, { once: true });
    worker.postMessage({ tipo: "leer", id, ancho: img.width, alto: img.height, pixeles, fechaReferencia: FECHA }, [pixeles]);
  });
}

let amarilla: ImageData;
let digital: ImageData;
let soloQr: ImageData;

beforeAll(async () => {
  await prepararEscritor({ overrides: { locateFile: () => urlEscritor }, fireImmediately: true });
  const fuente = new FontFace("OCRB-prueba", `url(${urlFuente})`);
  await fuente.load();
  document.fonts.add(fuente);
  amarilla = await imagenCodigo(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes, "PDF417", 1920, 1080, 1200);
  digital = reverso(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas);
  soloQr = await imagenCodigo("SINTETICO-QR", "QRCode", 1000, 630, 400);
  worker = new Worker(new URL("../workers/lector.worker.ts", import.meta.url), { type: "module" });
}, 60_000);

afterAll(() => worker?.terminate());

describe("OFF-06 Worker lector en navegador", { timeout: 180_000 }, () => {
  it("OFF-06 Amarilla sintética", async () => {
    const r = await leer(amarilla);
    expect(r.resultado).toMatchObject({ ok: true, tipo: "pdf417", resultado: { campos: { numeroDocumento: "********56", lugarNacimiento: { codigo: "16001" } } } });
    expect(JSON.stringify(r)).not.toContain("9999123456");
  });

  it("OFF-06 Digital sintética", async () => {
    const r = await leer(digital);
    expect(r.resultado).toMatchObject({ ok: true, tipo: "mrz", resultado: { campos: { nuip: "********56", serial: "*******45" }, lineasCorregidas: null } });
  });

  it("OFF-07 Imagen con solo un QR", async () => {
    const r = await leer(soloQr);
    expect(r.resultado.ok).toBe(false);
    if (r.resultado.ok) return;
    expect(["mrz-no-encontrada", "tiempo-agotado"]).toContain(r.resultado.error);
    expect(JSON.stringify(r)).not.toContain("SINTETICO-QR");
  });

  it("OFF-10 Giro 270 en el Worker", async () => {
    const recto = await leer(digital);
    const girado = await leer(girar270(digital));
    expect(girado.resultado.ok).toBe(true);
    if (!girado.resultado.ok || !recto.resultado.ok) return;
    expect(girado.resultado.intento).toMatch(/@(90|270)$/u);
    expect(girado.resultado.resultado).toStrictEqual(recto.resultado.resultado);
  });

  it("OFF-11 mensaje mal formado: sin respuesta y el Worker sigue vivo", async () => {
    worker.postMessage({ tipo: "otro" });
    const r = await leer(amarilla);
    expect(r.resultado.ok).toBe(true);
  });
});
