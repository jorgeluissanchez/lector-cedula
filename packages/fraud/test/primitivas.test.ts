// Tarea 4.1 (cambio deteccion-fraude): primitivas con oráculos analíticos.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dct8x8, homografia, idct8x8, ladosCuadrilatero, magnitudFft2d, rectificar, rgbAHsv } from "../src/imagen/primitivas.js";

describe("4.1 FFT 2D", () => {
  it("impulso en el origen: espectro plano de magnitud 1", () => {
    const n = 16;
    const v = new Float64Array(n * n);
    v[0] = 1;
    const m = magnitudFft2d(v, n);
    for (const x of m) expect(x).toBeCloseTo(1, 10);
  });

  it("seno puro: dos picos en (±k, 0) de magnitud n²/2", () => {
    const n = 32;
    const k = 5;
    const v = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) v[y * n + x] = Math.cos((2 * Math.PI * k * x) / n);
    const m = magnitudFft2d(v, n);
    expect(m[k]).toBeCloseTo((n * n) / 2, 6);
    expect(m[n - k]).toBeCloseTo((n * n) / 2, 6);
    let resto = 0;
    m.forEach((x, i) => { if (i !== k && i !== n - k) resto += x; });
    expect(resto).toBeLessThan(1e-6);
  });

  it("propiedad: Parseval", () => {
    const n = 8;
    fc.assert(
      fc.property(fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: 64, maxLength: 64 }), (xs) => {
        const v = Float64Array.from(xs);
        const m = magnitudFft2d(v, n);
        const e1 = xs.reduce((s, x) => s + x * x, 0);
        const e2 = m.reduce((s, x) => s + x * x, 0) / (n * n);
        expect(e2).toBeCloseTo(e1, 4);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("4.1 DCT 8x8", () => {
  it("bloque constante: solo DC = 8 * valor", () => {
    const c = dct8x8(new Array(64).fill(10));
    expect(c[0]).toBeCloseTo(80, 10);
    for (let i = 1; i < 64; i++) expect(Math.abs(c[i] as number)).toBeLessThan(1e-9);
  });

  it("propiedad: idct(dct(x)) = x y conserva la energía", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -255, max: 255, noNaN: true }), { minLength: 64, maxLength: 64 }), (xs) => {
        const c = dct8x8(xs);
        const y = idct8x8(c);
        xs.forEach((x, i) => expect(y[i]).toBeCloseTo(x, 6));
        expect(c.reduce((s, x) => s + x * x, 0)).toBeCloseTo(xs.reduce((s, x) => s + x * x, 0), 3);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("4.1 HSV", () => {
  it.each([
    [[255, 0, 0], [0, 1, 1]],
    [[0, 255, 0], [120, 1, 1]],
    [[0, 0, 255], [240, 1, 1]],
    [[255, 255, 0], [60, 1, 1]],
    [[255, 0, 255], [300, 1, 1]],
    [[128, 128, 128], [0, 0, 128 / 255]],
    [[0, 0, 0], [0, 0, 0]],
  ])("rgb %j -> hsv %j", (rgb, hsv) => {
    const r = rgbAHsv(...(rgb as [number, number, number]));
    r.forEach((x, i) => expect(x).toBeCloseTo(hsv[i] as number, 6));
  });
});

describe("4.1 rectificación", () => {
  it("homografía identidad y lados", () => {
    const q = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }];
    expect(Array.from(homografia(q, 10, 5)).map((x) => Math.round(x * 1e9) / 1e9)).toStrictEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(ladosCuadrilatero(q)).toStrictEqual({ ancho: 10, alto: 5 });
  });

  it("rectifica un cuadrilátero desplazado y escalado conservando el contenido", () => {
    const W = 40;
    const H = 30;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[(y * W + x) * 4] = x < 20 ? 0 : 200;
    const q = [{ x: 10, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 25 }, { x: 10, y: 25 }];
    const img = rectificar({ data, width: W, height: H }, q, 40, 40);
    expect(img.r[10 * 40 + 5]).toBe(0);
    expect(img.r[10 * 40 + 35]).toBe(200);
  });
});
