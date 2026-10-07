import { describe, expect, it } from "vitest";
import { medirExposicion } from "../src/calidad/exposicion.js";
import { luminanciasFrame } from "../src/calidad/luminancia.js";
import { calcularRegion } from "../src/calidad/region.js";
import { medirTamano } from "../src/calidad/tamano.js";
import type { Cuadrilatero } from "../src/calidad/tipos.js";
import { brillo, completo, gris, rect, ruido, type Escena } from "./escenas.js";

/** Valores por defecto de CAL-08 que usan la exposición y el tamaño. */
const U = {
  luminanciaOscura: 5,
  fraccionOscuraMax: 0.25,
  mediaNegra: 20,
  mediaOscuraOk: 60,
  mediaClaraOk: 200,
  mediaBlanca: 240,
  ratioMinimo: 0.1,
  ratioOk: 0.3,
};

function exposicion(e: Escena, cuad: Cuadrilatero = completo(e.ancho, e.alto)) {
  const region = calcularRegion(cuad, e.ancho, e.alto);
  if (!region.ok) throw new Error("región inválida en la prueba");
  return medirExposicion(luminanciasFrame(e.pixeles, e.ancho, e.alto), region.mascara, region.tamano, U);
}

describe("CAL-05 Exposición", { timeout: 60_000 }, () => {
  it("CAL-05 Grises uniformes", () => {
    const obtenidos = [128, 10, 40, 220, 245].map((v) => {
      const m = exposicion(gris(64, 64, v));
      return [m.subscoreOscuro, m.subscoreSobreexpuesto];
    });
    expect(obtenidos).toStrictEqual([[100, 100], [0, 100], [50, 100], [100, 50], [100, 0]]);
  });

  it("CAL-05 Sombras recortadas", () => {
    const e = gris(64, 64, 200);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) e.pixeles.set([0, 0, 0, 255], (y * 64 + x) * 4);
    expect(exposicion(e)).toStrictEqual({ media: 100, fraccionOscura: 0.5, subscoreOscuro: 0, subscoreSobreexpuesto: 100 });
  });

  it("CAL-05 Umbral de sombra inclusivo y fracción parcial", () => {
    // 1/8 de los píxeles a 5 (cuenta como sombra) y 1/8 a 6 (no cuenta), el resto 128: fraccionOscura 0,125 -> oscuro 50.
    const e = gris(8, 8, 128);
    for (let x = 0; x < 8; x++) {
      e.pixeles.set([5, 5, 5, 255], x * 4);
      e.pixeles.set([6, 6, 6, 255], (8 + x) * 4);
    }
    const m = exposicion(e);
    expect([m.fraccionOscura, m.subscoreOscuro]).toStrictEqual([0.125, 50]);
  });

  it("CAL-05 Solo cuenta M", () => {
    // Columnas 0..31 negras fuera de M = rect (32,0)-(64,64): la exposición es la del gris 200.
    const e = gris(64, 64, 200);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) e.pixeles.set([0, 0, 0, 255], (y * 64 + x) * 4);
    expect(exposicion(e, rect(32, 0, 64, 64))).toStrictEqual({ media: 200, fraccionOscura: 0, subscoreOscuro: 100, subscoreSobreexpuesto: 100 });
  });

  it("CAL-05 Más brillo nunca mejora la sobreexposición", () => {
    let cambiaMedia = 0;
    for (let semilla = 1; semilla <= 100; semilla++) {
      const original = ruido(64, 64, semilla);
      const a = exposicion(original);
      const b = exposicion(brillo(original, 1.2));
      expect(b.media).toBeGreaterThanOrEqual(a.media);
      expect(b.subscoreSobreexpuesto).toBeLessThanOrEqual(a.subscoreSobreexpuesto);
      if (b.media > a.media) cambiaMedia++;
    }
    // No vacuidad: la transformación cambia la media en todos los frames.
    expect(cambiaMedia).toBe(100);
  });
});

describe("CAL-06 Tamaño relativo", () => {
  it("CAL-06 Ratios conocidos", () => {
    const cuads = [rect(0, 0, 320, 180), completo(640, 360), rect(0, 0, 128, 72)];
    expect(cuads.map((c) => medirTamano(c, 640, 360, U))).toStrictEqual([
      { ratio: 0.25, subscore: 75 },
      { ratio: 1, subscore: 100 },
      { ratio: 0.04, subscore: 0 },
    ]);
  });

  it("CAL-06 El área usa la fórmula del polígono con cualquier orientación", () => {
    // Rombo de diagonales 320 y 270 centrado: área 43200 = 0,1875 del frame -> 43,75 -> 44; recorrido inverso, mismo ratio.
    const rombo: Cuadrilatero = [[320, 45], [480, 180], [320, 315], [160, 180]];
    expect(medirTamano(rombo, 640, 360, U)).toStrictEqual({ ratio: 0.1875, subscore: 44 });
    const inverso: Cuadrilatero = [[160, 180], [320, 315], [480, 180], [320, 45]];
    expect(medirTamano(inverso, 640, 360, U)).toStrictEqual({ ratio: 0.1875, subscore: 44 });
  });
});
