import { describe, expect, it } from "vitest";
import { luminanciasFrame } from "../src/calidad/luminancia.js";
import { medirNitidez, subscoreNitidez } from "../src/calidad/nitidez.js";
import { calcularRegion } from "../src/calidad/region.js";
import type { Cuadrilatero } from "../src/calidad/tipos.js";
import { completo, desenfoqueCaja, gris, rayas, rect, ruido, tablero, type Escena } from "./escenas.js";

/** Valores por defecto de CAL-08 que usa la nitidez. */
const U = { laplacianoDesenfocado: 8, laplacianoNitido: 35 };

function nitidez(e: Escena, cuad: Cuadrilatero = completo(e.ancho, e.alto)) {
  const region = calcularRegion(cuad, e.ancho, e.alto);
  if (!region.ok) throw new Error("región inválida en la prueba");
  return medirNitidez(luminanciasFrame(e.pixeles, e.ancho, e.alto), region.mascara, e.ancho, e.alto, U);
}

// 600 s: bajo la instrumentación de Stryker (perTest) la metamórfica tarda más de 60 s; en Vitest normal, unos 3 s.
describe("CAL-03 Nitidez", { timeout: 600_000 }, () => {
  it("CAL-03 Patrones de varianza conocida", () => {
    const escenas = [gris(64, 64, 128), tablero(64, 64, 0, 255), rayas(64, 64, 0, 255), tablero(64, 64, 60, 190)];
    expect(escenas.map((e) => nitidez(e))).toStrictEqual([
      { varianza: 0, subscore: 0 },
      { varianza: 1040400, subscore: 100 },
      { varianza: 260100, subscore: 100 },
      { varianza: 270400, subscore: 100 },
    ]);
  });

  it("CAL-03 Subscore intermedio", () => {
    expect([8, 21.5, 27, 35].map((v) => subscoreNitidez(v, U))).toStrictEqual([0, 50, 70, 100]);
  });

  it("CAL-03 Solo cuentan los píxeles de M que no están en el borde del frame", () => {
    // Un único píxel 255 en el borde (0, 0) no entra: su Laplaciano no se calcula; el de su vecino (1, 1) no le alcanza.
    const e = gris(8, 8, 0);
    e.pixeles.set([255, 255, 255, 255], 0);
    expect(nitidez(e).varianza).toBe(0);
    // Mitad izquierda de rayas y mitad derecha gris: con rect (0,0)-(3,8) solo se miden las rayas interiores x = 1..2.
    const mixta = rayas(8, 8, 0, 255);
    for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) mixta.pixeles.set([128, 128, 128, 255], (y * 8 + x) * 4);
    expect(nitidez(mixta, rect(0, 0, 3, 8)).varianza).toBe(260100);
    // Un M solo en el borde del frame no tiene píxeles medibles: varianza 0.
    expect(nitidez(tablero(8, 8, 0, 255), rect(0, 0, 8, 1))).toStrictEqual({ varianza: 0, subscore: 0 });
  });

  it("CAL-03 Varianza poblacional, no muestral", () => {
    // Columna central 255 sobre 0 en 5x3: interior (1..3, 1); Laplacianos a mano: x=1: 255, x=2: -510, x=3: 255.
    const e = gris(5, 3, 0);
    for (let y = 0; y < 3; y++) e.pixeles.set([255, 255, 255, 255], (y * 5 + 2) * 4);
    // Media 0; varianza poblacional (255² + 510² + 255²) / 3 = 130050 (la muestral sería 195075).
    expect(nitidez(e).varianza).toBe(130050);
  });

  it("CAL-03 El desenfoque nunca mejora la nitidez", () => {
    let utiles = 0;
    for (let semilla = 1; semilla <= 100; semilla++) {
      let actual = ruido(128, 128, semilla);
      const original = nitidez(actual);
      const varianzas = [original.varianza];
      const subscores = [original.subscore];
      for (let i = 0; i < 3; i++) {
        actual = desenfoqueCaja(actual);
        const n = nitidez(actual);
        varianzas.push(n.varianza);
        subscores.push(n.subscore);
      }
      expect(varianzas[1]).toBeLessThanOrEqual(0.05 * (varianzas[0] ?? 0));
      for (let i = 1; i < 4; i++) {
        expect(varianzas[i]).toBeLessThanOrEqual(varianzas[i - 1] ?? 0);
        expect(subscores[i]).toBeLessThanOrEqual(subscores[i - 1] ?? 0);
      }
      if ((varianzas[0] ?? 0) > 0) utiles++;
    }
    expect(utiles).toBe(100);
  });
});
