// Enderezado del recorte antes del OCR (apoyo de LMI-04 y LMI-06): lienzos literales con barras inclinadas.
import { describe, expect, it } from "vitest";
import { angulosProbados, enderezar, estimarInclinacion } from "../../src/mrz/enderezar.js";

/** Lienzo blanco con 3 barras negras de 2 px inclinadas `grados` (positivo: bajan hacia la derecha). */
function barras(grados: number, w = 400, h = 200) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const tan = Math.tan((grados * Math.PI) / 180);
  for (const y0 of [60, 100, 140]) {
    for (let x = 20; x < w - 20; x++) {
      const y = Math.round(y0 + (x - w / 2) * tan);
      for (const yy of [y, y + 1]) data.fill(0, (yy * w + x) * 4, (yy * w + x) * 4 + 3);
    }
  }
  return { width: w, height: h, data };
}

describe("Enderezado del recorte", { timeout: 60_000 }, () => {
  it("estima la inclinación con signo y paso de 0,25°", () => {
    expect(estimarInclinacion(barras(2))).toBe(2);
    expect(estimarInclinacion(barras(-2))).toBe(-2);
    expect(estimarInclinacion(barras(0))).toBe(0);
    expect(estimarInclinacion(barras(1.25))).toBe(1.25);
    expect(estimarInclinacion(barras(-3.75))).toBe(-3.75);
  });

  it("sin tinta separable la inclinación es 0", () => {
    const blanco = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(255) };
    expect(estimarInclinacion(blanco)).toBe(0);
  });

  it("no gira por debajo de 0,5° y gira en sentido contrario por encima", () => {
    const recta = barras(0.25);
    expect(enderezar(recta)).toBe(recta);
    const inclinada = barras(2);
    const r = enderezar(inclinada);
    expect(r).not.toBe(inclinada);
    expect(estimarInclinacion(r)).toBe(0);
    const media = barras(0.5);
    expect(enderezar(media)).not.toBe(media);
  });
});

describe("Enderezado: ángulos y empates", { timeout: 60_000 }, () => {
  it("prueba de 0 a ±4° en pasos de 0,25°, ordenados por valor absoluto", () => {
    const a = angulosProbados();
    expect(a).toHaveLength(33);
    expect(a.slice(0, 5)).toStrictEqual([0, 0.25, -0.25, 0.5, -0.5]);
    expect(a.slice(-2)).toStrictEqual([4, -4]);
  });

  it("con un único punto de tinta todos los ángulos empatan y gana 0", () => {
    const data = new Uint8ClampedArray(50 * 20 * 4).fill(255);
    data.fill(0, (10 * 50 + 25) * 4, (10 * 50 + 25) * 4 + 3);
    expect(estimarInclinacion({ width: 50, height: 20, data })).toBe(0);
  });

  it("detecta los extremos ±4° y la luminancia ponderada (tinta solo en el canal rojo)", () => {
    expect(estimarInclinacion(barras(4))).toBe(4);
    expect(estimarInclinacion(barras(-4))).toBe(-4);
    // Barras rojas puras (luminancia 76) sobre fondo cian (luminancia 178): se separan por luminancia.
    const p = barras(2);
    for (let i = 0; i < p.data.length; i += 4) {
      const tinta = p.data[i] === 0;
      p.data[i] = tinta ? 255 : 0;
      p.data[i + 1] = tinta ? 0 : 255;
      p.data[i + 2] = tinta ? 0 : 255;
    }
    expect(estimarInclinacion(p)).toBe(2);
  });
});
