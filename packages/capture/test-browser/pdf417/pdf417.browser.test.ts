// Spec lectura-pdf417-imagen en Chromium real: LPI-03 (ImageData y bytes) y LPI-04 (invariancia metamórfica).
// S se genera en memoria con el writer de zxing-wasm; las distorsiones se aplican con canvas 2D. Sin imágenes en el repo.
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { prepareZXingModule as prepararLector } from "zxing-wasm/reader";
import urlLector from "zxing-wasm/reader/zxing_reader.wasm?url";
import { prepareZXingModule as prepararEscritor, writeBarcode } from "zxing-wasm/writer";
import urlEscritor from "zxing-wasm/writer/zxing_writer.wasm?url";
import { beforeAll, describe, expect, it } from "vitest";
import { decodificarPdf417Imagen } from "../../src/index.js";

const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
let S: ImageData;

function lienzo(ancho: number, alto: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(ancho, alto);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("sin 2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, ancho, alto);
  return [c, ctx];
}

function aCanvas(img: ImageData): OffscreenCanvas {
  const [c, ctx] = lienzo(img.width, img.height);
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Dibuja S transformada: `factor` de escala, `grados` de rotación y un `filter` CSS de canvas. */
function distorsionar(img: ImageData, { factor = 1, grados = 0, filtro = "none" }: { factor?: number; grados?: number; filtro?: string }): ImageData {
  const w = Math.round(img.width * factor);
  const h = Math.round(img.height * factor);
  const [, ctx] = lienzo(w, h);
  ctx.filter = filtro;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((grados * Math.PI) / 180);
  ctx.drawImage(aCanvas(img), -w / 2, -h / 2, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function aJpeg(img: ImageData, calidad: number): Promise<Uint8Array> {
  const blob = await aCanvas(img).convertToBlob({ type: "image/jpeg", quality: calidad });
  return new Uint8Array(await blob.arrayBuffer());
}

beforeAll(async () => {
  await prepararLector({ overrides: { locateFile: () => urlLector }, fireImmediately: true });
  await prepararEscritor({ overrides: { locateFile: () => urlEscritor }, fireImmediately: true });
  const escrito = await writeBarcode(F.bytes, { format: "PDF417" });
  if (escrito.image === null) throw new Error(escrito.error);
  const mapa = await createImageBitmap(escrito.image);
  const [, ctx] = lienzo(1920, 1080);
  ctx.imageSmoothingEnabled = false;
  const alto = Math.round((mapa.height * 1200) / mapa.width);
  ctx.drawImage(mapa, Math.floor((1920 - 1200) / 2), Math.floor((1080 - alto) / 2), 1200, alto);
  S = ctx.getImageData(0, 0, 1920, 1080);
}, 60_000);

describe("LPI-03 Entradas aceptadas y errores (navegador)", { timeout: 60_000 }, () => {
  it("LPI-03 ImageData en navegador", async () => {
    expect(S).toBeInstanceOf(ImageData);
    expect(await decodificarPdf417Imagen(S)).toStrictEqual({ ok: true, bytes: F.bytes, intento: "original" });
  });

  it("LPI-03 bytes PNG en navegador (createImageBitmap)", async () => {
    const png = new Uint8Array(await (await aCanvas(S).convertToBlob({ type: "image/png" })).arrayBuffer());
    expect(await decodificarPdf417Imagen(png)).toStrictEqual({ ok: true, bytes: F.bytes, intento: "original" });
    expect(await decodificarPdf417Imagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))).toStrictEqual({
      ok: false,
      error: "imagen-ilegible",
    });
  });
});

describe("LPI-04 Invariancia metamórfica", { timeout: 120_000 }, () => {
  const leves: [string, () => Promise<ImageData | Uint8Array>][] = [
    ["rotación +3°", async () => distorsionar(S, { grados: 3 })],
    ["rotación -3°", async () => distorsionar(S, { grados: -3 })],
    ["blur gaussiano sigma 1", async () => distorsionar(S, { filtro: "blur(1px)" })],
    ["escala 0,8", async () => distorsionar(S, { factor: 0.8 })],
    ["brillo +20 %", async () => distorsionar(S, { filtro: "brightness(1.2)" })],
    ["brillo -20 %", async () => distorsionar(S, { filtro: "brightness(0.8)" })],
    ["JPEG calidad 70", () => aJpeg(S, 0.7)],
  ];

  for (const [nombre, aplicar] of leves) {
    it(`LPI-04 Distorsiones leves decodifican igual: ${nombre}`, async () => {
      const r = await decodificarPdf417Imagen(await aplicar());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.bytes).toStrictEqual(F.bytes);
    });
  }

  it("LPI-04 Distorsión fuerte no inventa datos", async () => {
    const r = await decodificarPdf417Imagen(distorsionar(S, { factor: 0.3, filtro: "blur(4px)" }));
    if (r.ok) expect(r.bytes).toStrictEqual(F.bytes);
    else expect(r).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
  });
});
