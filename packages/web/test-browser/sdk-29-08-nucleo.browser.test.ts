// SDK-29 (sin DOM ni CSS), SDK-08 (leerDocumento real), SDK-06/07/39 (Cache Storage real) y SDK-30 (cámara real
// simulada) en Chromium. Imágenes SINTÉTICAS de PERSONA_BASE generadas en memoria. Requiere `npm run build -w
// @lector-cedula/web` (dist/assets) y `npm run modelos:mrz`.
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { prepareZXingModule as prepararEscritor, writeBarcode } from "zxing-wasm/writer";
import urlEscritor from "zxing-wasm/writer/zxing_writer.wasm?url";
import { beforeAll, describe, expect, it } from "vitest";
import { crearLector, leerDocumento, NOMBRE_CACHE, precargarMotor, type EstadoLector } from "../src/index.js";
import { crearFalsos, esperar } from "../test/falsos.js";

const REC = new URL("/__assets_sdk__/", location.href).href;

function lienzo(ancho: number, alto: number, fondo = "#fff"): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(ancho, alto);
  const ctx = c.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, alto);
  return [c, ctx];
}

let amarilla: ImageData;

beforeAll(async () => {
  await prepararEscritor({ overrides: { locateFile: () => urlEscritor }, fireImmediately: true });
  const escrito = await writeBarcode(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes, { format: "PDF417" });
  if (escrito.image === null) throw new Error(escrito.error);
  const bitmap = await createImageBitmap(escrito.image);
  const [, ctx] = lienzo(1920, 1080);
  ctx.imageSmoothingEnabled = false;
  const alto = Math.round((bitmap.height * 1200) / bitmap.width);
  ctx.drawImage(bitmap, 360, Math.floor((1080 - alto) / 2), 1200, alto);
  amarilla = ctx.getImageData(0, 0, 1920, 1080);
}, 60_000);

describe("SDK-29 Núcleo sin efectos en el DOM", () => {
  it("SDK-29 Sin efectos en el DOM: solo muta el video; sin hojas ni Custom Elements", async () => {
    const video = document.createElement("video");
    document.body.append(video);
    const hojas = document.styleSheets.length;
    const adoptadas = document.adoptedStyleSheets.length;
    const mutaciones: MutationRecord[] = [];
    const obs = new MutationObserver((m) => mutaciones.push(...m));
    obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const c = crearLector({}, crearFalsos().deps);
    await c.iniciar(video);
    await esperar(c.obtenerEstado, (e) => e.fase === "resultado");
    c.destruir();
    await new Promise((r) => setTimeout(r, 0));
    mutaciones.push(...obs.takeRecords());
    obs.disconnect();
    expect(mutaciones.filter((m) => m.target !== video)).toStrictEqual([]);
    expect(document.styleSheets.length).toBe(hojas);
    expect(document.adoptedStyleSheets.length).toBe(adoptadas);
    expect(customElements.get("lector-cedula")).toBeUndefined();
    video.remove();
  });
});

describe("SDK-08, SDK-06, SDK-07 y SDK-39 con el motor real", { timeout: 180_000 }, () => {
  it("SDK-07 Recursos no disponibles: 404 del manifiesto rechaza con motor-no-disponible", async () => {
    await expect(precargarMotor({ recursos: new URL("/no-existe/lector/", location.href).href })).rejects.toMatchObject({ codigo: "motor-no-disponible" });
  });

  it("SDK-06 Limpieza de versiones previas y contenido de la caché tras precargar", async () => {
    await caches.open("lector-cedula-sdk-0.0.1");
    await precargarMotor({ recursos: REC });
    const claves = await caches.keys();
    expect(claves.filter((k) => k.startsWith("lector-cedula-sdk-"))).toStrictEqual([NOMBRE_CACHE]);
    const cache = await caches.open(NOMBRE_CACHE);
    for (const p of await cache.keys()) {
      expect(p.url.startsWith(REC)).toBe(true);
      const tipo = (await cache.match(p))?.headers.get("content-type") ?? "";
      expect(tipo.startsWith("image/")).toBe(false);
      if (tipo === "application/json") expect(p.url).toBe(`${REC}manifest.json`);
    }
  });

  it("SDK-08 amarilla sintética: resultado de presentación con confiable false", async () => {
    const r = await leerDocumento(amarilla, { recursos: REC });
    expect(r).toMatchObject({ tipo: "cedula-ciudadania", confiable: false, validacion_id: null, campos: { nuip: "9999123456" } });
  });

  it("SDK-08 Metamórfica: brillo +20 % y JPEG 70 dan el mismo resultado (nunca otro NUIP)", async () => {
    const base = await leerDocumento(amarilla, { recursos: REC });
    const brillo = new ImageData(new Uint8ClampedArray(amarilla.data), amarilla.width, amarilla.height);
    for (let i = 0; i < brillo.data.length; i += 4) for (let k = 0; k < 3; k++) brillo.data[i + k] = Math.min(255, (brillo.data[i + k] ?? 0) * 1.2);
    expect(await leerDocumento(brillo, { recursos: REC })).toStrictEqual(base);
    const [c, ctx] = lienzo(amarilla.width, amarilla.height);
    ctx.putImageData(amarilla, 0, 0);
    const jpeg = await c.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    expect(await leerDocumento(jpeg, { recursos: REC })).toStrictEqual(base);
  });

  it("SDK-08 Imagen sin documento: gris 1280x800 rechaza con lectura-fallida", async () => {
    const [c] = lienzo(1280, 800, "#808080");
    const png = await c.convertToBlob({ type: "image/png" });
    await expect(leerDocumento(png, { recursos: REC })).rejects.toMatchObject({ codigo: "lectura-fallida" });
  });

  it("SDK-08 Cancelación: AbortError", async () => {
    const control = new AbortController();
    const p = leerDocumento(amarilla, { recursos: REC, senal: control.signal });
    control.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(await p.catch((e: unknown) => e)).toBeInstanceOf(DOMException);
  });

  it("SDK-11 nada del documento en almacenamiento local ni en la caché", async () => {
    await leerDocumento(amarilla, { recursos: REC });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(await indexedDB.databases()).toStrictEqual([]);
    const cache = await caches.open(NOMBRE_CACHE);
    for (const p of await cache.keys()) {
      const t = await ((await cache.match(p)) as Response).text();
      expect(t.includes("9999123456"), p.url).toBe(false);
    }
  });
});

describe("SDK-30 cámara simulada real", { timeout: 60_000 }, () => {
  it("SDK-30 Cancelar libera la cámara (pistas ended) con las dependencias por omisión", async () => {
    const video = document.createElement("video");
    video.muted = true;
    const c = crearLector({ recursos: REC });
    const fases: string[] = [];
    c.suscribir((e: EstadoLector) => fases.push(e.fase));
    await c.iniciar(video);
    expect(c.obtenerEstado().fase).toMatch(/activo|listo/u);
    const stream = video.srcObject as MediaStream;
    const pistas = stream.getTracks();
    expect(pistas.length).toBeGreaterThan(0);
    c.cancelar();
    expect(c.obtenerEstado().fase).toBe("inicio");
    expect(pistas.every((p) => p.readyState === "ended")).toBe(true);
    expect(video.srcObject).toBeNull();
    c.destruir();
  });
});
