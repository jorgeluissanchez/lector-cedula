import { describe, expect, it } from "vitest";
import { luminanciasFrame } from "../src/calidad/luminancia.js";
import { medirReflejo } from "../src/calidad/reflejo.js";
import { calcularRegion } from "../src/calidad/region.js";
import type { Cuadrilatero } from "../src/calidad/tipos.js";
import { bloque, completo, disco, gris, pintar, rect, type Escena } from "./escenas.js";

/** Valores por defecto de CAL-08 que usa el reflejo. */
const U = { luminanciaSaturada: 250, fraccionSaturadaMax: 0.05, componenteSaturadoMax: 0.02 };

function reflejo(e: Escena, cuad: Cuadrilatero = completo(e.ancho, e.alto)) {
  const region = calcularRegion(cuad, e.ancho, e.alto);
  if (!region.ok) throw new Error("región inválida en la prueba");
  return medirReflejo(luminanciasFrame(e.pixeles, e.ancho, e.alto), region.mascara, e.ancho, e.alto, region.tamano, U);
}

const base = () => gris(100, 100, 128);

describe("CAL-04 Reflejo", { timeout: 60_000 }, () => {
  it("CAL-04 Reflejos de tamaño conocido", () => {
    expect([base(), bloque(base(), 255, 40, 49, 40, 49), bloque(base(), 255, 40, 59, 40, 59)].map((e) => reflejo(e))).toStrictEqual([
      { fraccionSaturada: 0, componenteMayor: 0, subscore: 100 },
      { fraccionSaturada: 0.01, componenteMayor: 0.01, subscore: 50 },
      { fraccionSaturada: 0.04, componenteMayor: 0.04, subscore: 0 },
    ]);
  });

  it("CAL-04 Saturados dispersos", () => {
    const e = base();
    for (let y = 40; y <= 59; y++) for (let x = 40; x <= 59; x++) if ((x + y) % 2 === 0) pintar(e, x, y, 255);
    expect(reflejo(e)).toStrictEqual({ fraccionSaturada: 0.02, componenteMayor: 0.0001, subscore: 60 });
  });

  it("CAL-04 Conectividad de 4 vecinos", () => {
    const e = bloque(bloque(base(), 255, 20, 29, 20, 29), 255, 30, 39, 30, 39);
    expect(reflejo(e)).toStrictEqual({ fraccionSaturada: 0.02, componenteMayor: 0.01, subscore: 50 });
  });

  it("CAL-04 Los componentes se unen por lados compartidos", () => {
    // Dos bloques de 10x10 que comparten un lado forman un único componente de 200 píxeles.
    const e = bloque(bloque(base(), 255, 20, 29, 20, 29), 255, 30, 39, 20, 29);
    expect(reflejo(e)).toStrictEqual({ fraccionSaturada: 0.02, componenteMayor: 0.02, subscore: 0 });
    // Una "U" exige seguir el componente en varias direcciones: 3 columnas de 10 unidas por abajo.
    const u = bloque(bloque(bloque(bloque(base(), 255, 10, 10, 10, 19), 255, 14, 14, 10, 19), 255, 18, 18, 10, 19), 255, 10, 18, 19, 19);
    expect(reflejo(u).componenteMayor).toBe(36 / 10000);
  });

  it("CAL-04 El final de una fila no es vecino del inicio de la siguiente", () => {
    // (9, 0) y (0, 1) son contiguos en memoria pero no en la imagen; igual (0, 1) y (9, 0) en sentido inverso.
    const e = gris(10, 10, 128);
    pintar(e, 9, 0, 255);
    pintar(e, 0, 1, 255);
    expect(reflejo(e)).toStrictEqual({ fraccionSaturada: 0.02, componenteMayor: 0.01, subscore: 50 });
  });

  it("CAL-04 Umbral de saturación exacto", () => {
    expect(reflejo(bloque(base(), 249, 40, 59, 40, 59)).subscore).toBe(100);
    expect(reflejo(bloque(base(), 250, 40, 59, 40, 59)).subscore).toBe(0);
  });

  it("CAL-04 Reflejo fuera del cuadrilátero", () => {
    expect(reflejo(bloque(base(), 255, 70, 89, 40, 59), rect(0, 0, 50, 100))).toStrictEqual({
      fraccionSaturada: 0,
      componenteMayor: 0,
      subscore: 100,
    });
  });

  it("CAL-04 Un componente que cruza el borde del cuadrilátero solo cuenta su parte dentro de M", () => {
    // Bloque [40..59]x[40..59] (400 px) con M = columnas 0..49: dentro quedan 10x20 = 200 px de 5000.
    expect(reflejo(bloque(base(), 255, 40, 59, 40, 59), rect(0, 0, 50, 100))).toStrictEqual({
      fraccionSaturada: 0.04,
      componenteMayor: 0.04,
      subscore: 0,
    });
  });

  it("CAL-04 Reutilizar el estado entre frames de distinto tamaño no altera el resultado", () => {
    const grande = bloque(gris(200, 200, 128), 255, 0, 9, 0, 9);
    const primero = reflejo(grande);
    const pequeno = reflejo(bloque(gris(10, 10, 128), 255, 0, 0, 0, 0));
    expect(reflejo(grande)).toStrictEqual(primero);
    expect(pequeno).toStrictEqual({ fraccionSaturada: 0.01, componenteMayor: 0.01, subscore: 50 });
  });

  it("CAL-04 Un reflejo mayor nunca mejora el subscore", () => {
    const subscores = [2, 4, 8, 16].map((r) => reflejo(disco(gris(128, 128, 128), 255, r)).subscore);
    for (let i = 1; i < subscores.length; i++) expect(subscores[i]).toBeLessThanOrEqual(subscores[i - 1] ?? 0);
    // No vacuidad: la secuencia recorre valores distintos (de casi 100 a 0).
    expect(subscores[0]).toBeGreaterThan(80);
    expect(subscores[3]).toBe(0);
  });
});
