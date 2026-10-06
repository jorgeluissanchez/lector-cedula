import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ErrorFixture } from "../src/errores.js";
import { crearPrng, validarSemilla } from "../src/prng.js";

/**
 * Secuencias literales derivadas de FX-06 (calculadas fuera del repositorio con la implementación de referencia):
 * 15 dígitos en el orden de design.md, decisión 5 y "Ajuste por evidencia" (2 de cabecera, 4 del AFIS, 8 del campo [40,48) y 1),
 * y los 4 primeros bytes de la cola.
 */
const SECUENCIAS = [
  { semilla: 1, digitos: "6 0 5 9 9 2 6 7 4 9 4 4 1 4 2", bytes: [0x27, 0x7d, 0x11, 0x65] },
  { semilla: 2, digitos: "7 3 2 5 8 6 4 3 7 1 7 2 4 8 5", bytes: [0x24, 0xac, 0x5d, 0xf8] },
];

describe("FX-06 Determinismo con semilla (PRNG)", { timeout: 60_000 }, () => {
  for (const { semilla, digitos, bytes } of SECUENCIAS) {
    it(`FX-06 Secuencia literal de mulberry32 con semilla ${semilla}`, () => {
      const prng = crearPrng(semilla);
      const obtenidos = Array.from({ length: 15 }, () => prng.digito());
      expect(obtenidos.join(" ")).toBe(digitos);
      expect(Array.from({ length: 4 }, () => prng.byte())).toStrictEqual(bytes);
    });

    it(`FX-06 digitos(n) consume en orden con semilla ${semilla}`, () => {
      const prng = crearPrng(semilla);
      expect([prng.digitos(2), prng.digitos(4), prng.digitos(8), prng.digitos(1)].join("")).toBe(digitos.replaceAll(" ", ""));
      expect(Array.from({ length: 4 }, () => prng.byte())).toStrictEqual(bytes);
    });
  }

  it("FX-06 Misma semilla, misma secuencia; generadores independientes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (semilla) => {
        const a = crearPrng(semilla);
        const b = crearPrng(semilla);
        const sa = Array.from({ length: 8 }, () => a.siguiente());
        const sb = Array.from({ length: 8 }, () => b.siguiente());
        expect(sa).toStrictEqual(sb);
        for (const r of sa) expect(r >= 0 && r < 1).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("FX-06 Dígitos y bytes en su rango", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (semilla) => {
        const prng = crearPrng(semilla);
        for (let i = 0; i < 16; i++) {
          const d = prng.digito();
          const b = prng.byte();
          expect(Number.isInteger(d) && d >= 0 && d <= 9).toBe(true);
          expect(Number.isInteger(b) && b >= 0 && b <= 255).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("FX-06 Los extremos de la semilla dan secuencias distintas entre sí", () => {
    const cero = crearPrng(0);
    const maxima = crearPrng(4294967295);
    expect(Array.from({ length: 8 }, () => cero.byte())).not.toStrictEqual(Array.from({ length: 8 }, () => maxima.byte()));
  });
});

describe("FX-03 Validación de la semilla", { timeout: 60_000 }, () => {
  it("FX-03 Semilla por omisión 1", () => {
    expect(validarSemilla(undefined)).toBe(1);
  });

  it("FX-03 Semillas límite aceptadas", () => {
    expect(validarSemilla(0)).toBe(0);
    expect(validarSemilla(4294967295)).toBe(4294967295);
    expect(validarSemilla(7)).toBe(7);
  });

  it("FX-03 Semillas inválidas rechazadas con semilla-invalida", () => {
    for (const valor of [-1, 1.5, 4294967296, Number.NaN, Number.POSITIVE_INFINITY, "1", null, 1n, {}, []]) {
      let error: unknown;
      try {
        validarSemilla(valor);
      } catch (e) {
        error = e;
      }
      expect(error, String(valor)).toBeInstanceOf(ErrorFixture);
      expect((error as ErrorFixture).codigo).toBe("semilla-invalida");
      expect((error as ErrorFixture).campo).toBe("semilla");
    }
  });
});
