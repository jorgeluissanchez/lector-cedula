import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calcularRegion } from "../src/calidad/region.js";
import type { Cuadrilatero } from "../src/calidad/tipos.js";
import { completo, GUIA_640 } from "./escenas.js";

function tamano(cuad: Cuadrilatero, ancho: number, alto: number): number | string {
  const r = calcularRegion(cuad, ancho, alto);
  return r.ok ? r.tamano : r.codigo;
}

describe("CAL-02 Cuadrilátero de análisis", { timeout: 60_000 }, () => {
  it("CAL-02 Guía en el frame de análisis", () => {
    expect(tamano(GUIA_640, 640, 360)).toBe(166536);
  });

  it("CAL-02 Cuadrilátero completo y parcialmente fuera del frame", () => {
    expect(tamano(completo(64, 64), 64, 64)).toBe(4096);
    expect(tamano([[-10, -10], [10, -10], [10, 10], [-10, 10]], 64, 64)).toBe(100);
  });

  it("CAL-02 Cuadriláteros inválidos", () => {
    const invalidos: Cuadrilatero[] = [
      [[0, 0], [64, 64], [64, 0], [0, 64]],
      [[0, 0], [10, 0], [20, 0], [30, 0]],
      [[0.6, 0.6], [0.9, 0.6], [0.9, 0.9], [0.6, 0.9]],
      [[0, 0], [Number.NaN, 0], [64, 64], [0, 64]],
    ];
    expect(invalidos.map((c) => calcularRegion(c, 64, 64))).toStrictEqual(
      Array.from({ length: 4 }, () => ({ ok: false, codigo: "cuadrilatero-invalido" })),
    );
  });

  it("CAL-02 Coordenadas infinitas y cuadrilátero fuera del frame también son inválidos", () => {
    expect(tamano([[0, 0], [Number.POSITIVE_INFINITY, 0], [64, 64], [0, 64]], 64, 64)).toBe("cuadrilatero-invalido");
    expect(tamano([[100, 100], [120, 100], [120, 120], [100, 120]], 64, 64)).toBe("cuadrilatero-invalido");
  });

  it("CAL-02 La máscara marca exactamente los píxeles cuyo centro está dentro o en el borde", () => {
    // Cuadrado [0,3]x[0,3]: solo los centros (x + 0,5, y + 0,5) con x, y en 0..2.
    const r = calcularRegion([[0, 0], [3, 0], [3, 3], [0, 3]], 4, 4);
    expect(r.ok && Array.from(r.mascara)).toStrictEqual([1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    // Borde exacto: el centro 0,5 sobre la arista x = 0,5 cuenta.
    const borde = calcularRegion([[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]], 4, 4);
    expect(borde.ok && Array.from(borde.mascara)).toStrictEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Rombo: solo los centros que cumplen |x - 2| + |y - 2| <= 1.
    const rombo = calcularRegion([[2, 1], [3, 2], [2, 3], [1, 2]], 4, 4);
    expect(rombo.ok && Array.from(rombo.mascara)).toStrictEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
  });

  it("CAL-02 Acepta el recorrido en sentido contrario", () => {
    expect(tamano([[0, 0], [0, 10], [10, 10], [10, 0]], 64, 64)).toBe(100);
  });

  it("CAL-02 Propiedad: rectángulos de esquinas enteras dentro del frame tienen M = ancho x alto", () => {
    const caso = fc
      .record({ w: fc.integer({ min: 1, max: 64 }), h: fc.integer({ min: 1, max: 64 }) })
      .chain(({ w, h }) =>
        fc.record({
          w: fc.constant(w),
          h: fc.constant(h),
          xs: fc.uniqueArray(fc.integer({ min: 0, max: w }), { minLength: 2, maxLength: 2 }),
          ys: fc.uniqueArray(fc.integer({ min: 0, max: h }), { minLength: 2, maxLength: 2 }),
        }),
      );
    fc.assert(
      fc.property(caso, ({ w, h, xs, ys }) => {
        const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
        const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
        const r = calcularRegion([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], w, h);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.tamano).toBe((x1 - x0) * (y1 - y0));
        expect(r.mascara.reduce((a, b) => a + b, 0)).toBe(r.tamano);
      }),
      { numRuns: 1000 },
    );
  });
});
