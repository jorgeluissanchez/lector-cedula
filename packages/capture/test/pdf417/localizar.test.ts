// Cambio localizar-pdf417-en-foto: LPI-09 a LPI-14. Solo imágenes sintéticas generadas en memoria.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { crearDecodificador, type DecodificadorPdf417, type Pixeles } from "../../src/index.js";
import { decodificarPixeles } from "../../src/pdf417/pixeles.js";
import { ALTO_D, ANCHO_D, conOrientacionExif, jpegDificilExif6, pixelesDificiles, type ImagenDificil } from "./sintetica-dificil.js";
import { codificarJpeg, imagenSintetica, lectorReal, pixelesSinteticos } from "./sintetica.js";

const LIMITE_MS = 600_000;
const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
const SIN_LIMITE = Number.POSITIVE_INFINITY;
let S: Uint8Array;
let leer: Awaited<ReturnType<typeof lectorReal>>;
let D: ImagenDificil;

beforeAll(async () => {
  leer = await lectorReal();
  S = await imagenSintetica(F.bytes);
  D = await pixelesDificiles(F.bytes);
}, 120_000);

type Resultados = Awaited<ReturnType<DecodificadorPdf417>>;
type Llamada = { readonly imagen: Pixeles; readonly opciones: Record<string, unknown> };

function registrador(responder: (n: number, opciones: Record<string, unknown>) => Resultados | Promise<Resultados>) {
  const llamadas: Llamada[] = [];
  const lector: DecodificadorPdf417 = async (imagen, opciones) => {
    const op = { ...opciones } as Record<string, unknown>;
    llamadas.push({ imagen, opciones: op });
    return responder(llamadas.length, op);
  };
  return { llamadas, lector };
}

describe("Imagen sintética difícil D (tarea 1.1)", () => {
  it("D mide 4096x1842 y el código ocupa entre el 13 % y el 17 % del área", () => {
    expect([D.width, D.height]).toStrictEqual([4096, 1842]);
    expect(D.fraccionCodigo).toBeGreaterThan(0.13);
    expect(D.fraccionCodigo).toBeLessThan(0.17);
  });
});

describe("LPI-09 Conversión a gris", { timeout: LIMITE_MS }, () => {
  it("LPI-09 El lector recibe gris", async () => {
    const p = await pixelesSinteticos(F.bytes);
    const tenida = new Uint8ClampedArray(p.data);
    for (let i = 0; i < tenida.length; i += 4) {
      tenida[i + 2] = 0;
      tenida[i + 3] = 200;
    }
    const { llamadas, lector } = registrador(() => []);
    await crearDecodificador({ readBarcodes: lector, limiteMs: SIN_LIMITE })({ data: tenida, width: p.width, height: p.height });
    expect(llamadas.length).toBeGreaterThan(5);
    for (const { imagen } of llamadas) {
      const d = imagen.data;
      let malos = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] !== d[i + 1] || d[i] !== d[i + 2] || d[i + 3] !== 255) malos++;
      expect(malos).toBe(0);
    }
  });
});

describe("LPI-10 Orientación EXIF", { timeout: LIMITE_MS }, () => {
  it("LPI-10 Ocho orientaciones", async () => {
    const w = 40;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
    const base = codificarJpeg({ data, width: w, height: h }, 95);
    const esquina: Record<number, string> = { 1: "si", 2: "sd", 3: "id", 4: "ii", 5: "si", 6: "sd", 7: "id", 8: "ii" };
    for (let o = 1; o <= 8; o++) {
      const p = await decodificarPixeles(conOrientacionExif(base, o));
      expect(p, `orientación ${o}`).not.toBeNull();
      if (p === null) return;
      expect([p.width, p.height], `orientación ${o}`).toStrictEqual(o <= 4 ? [40, 20] : [20, 40]);
      const luz = (x: number, y: number) => p.data[(y * p.width + x) * 4] as number;
      const r = p.width - 3;
      const b = p.height - 3;
      const muestras = { si: luz(2, 2), sd: luz(r, 2), id: luz(r, b), ii: luz(2, b) };
      const oscuras = Object.entries(muestras)
        .filter(([, v]) => v < 64)
        .map(([k]) => k);
      expect(oscuras, `orientación ${o}`).toStrictEqual([esquina[o]]);
    }
  });

  it("LPI-10 Orientación ausente o inválida equivale a 1", async () => {
    const j = codificarJpeg({ data: new Uint8ClampedArray(40 * 20 * 4).fill(255), width: 40, height: 20 }, 90);
    for (const bytes of [j, conOrientacionExif(j, 0), conOrientacionExif(j, 9)]) {
      const r = await decodificarPixeles(bytes);
      expect([r?.width, r?.height]).toStrictEqual([40, 20]);
    }
  });

  it("LPI-10 Foto rotada con EXIF", async () => {
    const r = await crearDecodificador({ readBarcodes: leer, limiteMs: SIN_LIMITE })(await jpegDificilExif6(F.bytes));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes).toStrictEqual(F.bytes);
  });
});

describe("LPI-11 Localización del código", { timeout: LIMITE_MS }, () => {
  it("LPI-11 Orden en imagen pequeña", async () => {
    const { llamadas, lector } = registrador(() => []);
    const r = await crearDecodificador({ readBarcodes: lector, limiteMs: SIN_LIMITE })(S);
    expect(r).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
    expect(llamadas).toHaveLength(49);
    for (const l of llamadas.slice(0, 5)) expect(l.opciones.binarizer).toBeUndefined();
    expect(llamadas.slice(5, 11).map((l) => l.opciones.binarizer)).toStrictEqual([
      "LocalAverage",
      "GlobalHistogram",
      "LocalAverage",
      "GlobalHistogram",
      "LocalAverage",
      "GlobalHistogram",
    ]);
    for (const l of llamadas.slice(5, 11)) expect(l.imagen.width * l.imagen.height).toBeLessThan(1920 * 1080);
    const ventanas = llamadas.slice(11);
    expect(ventanas.every((l) => l.opciones.binarizer === "LocalAverage" && l.opciones.tryDownscale === true)).toBe(true);
    expect(ventanas.map((l) => `${l.imagen.width}x${l.imagen.height}`)).toStrictEqual([
      ...Array<string>(4).fill("1344x756"),
      ...Array<string>(9).fill("960x540"),
      ...Array<string>(25).fill("672x378"),
    ]);
  });

  it("LPI-11 Banda primero en foto grande", async () => {
    const { llamadas, lector } = registrador(() => []);
    await crearDecodificador({ readBarcodes: lector, limiteMs: SIN_LIMITE })({ data: D.data, width: ANCHO_D, height: ALTO_D });
    for (const l of llamadas.slice(0, 6)) {
      expect(l.opciones.binarizer).toBeDefined();
      expect(l.imagen.width * l.imagen.height).toBeLessThan(ANCHO_D * ALTO_D);
    }
    expect([llamadas[6]?.imagen.width, llamadas[6]?.imagen.height, llamadas[6]?.opciones.binarizer]).toStrictEqual([4096, 1842, undefined]);
  });

  it("LPI-11 Símbolo rechazado por el parser", async () => {
    const { lector } = registrador((n) => (n <= 5 ? [] : [{ bytes: new Uint8Array([1, 2, 3]), isValid: true }]));
    const r = await crearDecodificador({ readBarcodes: lector, limiteMs: SIN_LIMITE })(S);
    expect(r).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
  });

  it("LPI-11 Foto sintética difícil", async () => {
    const imagen = { data: D.data, width: ANCHO_D, height: ALTO_D };
    expect(await crearDecodificador({ readBarcodes: leer, limiteMs: SIN_LIMITE, localizar: false })(imagen)).toStrictEqual({
      ok: false,
      error: "pdf417-no-encontrado",
    });
    const r = await crearDecodificador({ readBarcodes: leer, limiteMs: SIN_LIMITE })(imagen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes).toStrictEqual(F.bytes);
    expect(r.intento).toMatch(/^(banda|ventana)/u);
  });
});

describe("LPI-14 Intentos de banda y rejilla", { timeout: LIMITE_MS }, () => {
  it("LPI-14 Nombres y opciones", async () => {
    const { llamadas, lector } = registrador((n, op) => (n === 7 ? leer(S, op as never) : []));
    const r = await crearDecodificador({ readBarcodes: lector, limiteMs: SIN_LIMITE })(S);
    expect(r).toStrictEqual({ ok: true, bytes: F.bytes, intento: "banda-global" });
    expect(llamadas[6]?.opciones).toMatchObject({ binarizer: "GlobalHistogram", tryDownscale: true });
  });
});

describe("LPI-12 Límite de tiempo", () => {
  it("LPI-12 Corte por tiempo", async () => {
    let t = 0;
    const { llamadas, lector } = registrador(() => []);
    const r = await crearDecodificador({ readBarcodes: lector, limiteMs: 2_500, ahora: () => (t += 1_000) })(S);
    expect(r).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
    expect(llamadas).toHaveLength(3);
  });
});

describe("LPI-13 CLI con foto grande", { timeout: LIMITE_MS }, () => {
  it("LPI-13 CLI sobre D-EXIF6", async () => {
    const raiz = resolve(fileURLToPath(import.meta.url), "../../../../..");
    const dir = mkdtempSync(join(tmpdir(), "lpi13-"));
    try {
      const ruta = join(dir, "dificil.jpg");
      writeFileSync(ruta, await jpegDificilExif6(F.bytes));
      const p = spawnSync(process.execPath, [join(raiz, "tools/leer-foto.mjs"), "--sin-mascara", ruta], { cwd: raiz, encoding: "utf8", timeout: 300_000 });
      expect(p.status).toBe(0);
      const salida = JSON.parse(p.stdout) as { ok: boolean; resultado: { campos: Record<string, unknown> } };
      expect(salida.ok).toBe(true);
      expect(salida.resultado.campos).toMatchObject({ numeroDocumento: F.esperado.nuip, primerApellido: F.esperado.primerApellido });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
