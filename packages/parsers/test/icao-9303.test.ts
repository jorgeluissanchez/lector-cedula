// fixture-sintetico: las cadenas son ejemplos de ICAO Doc 9303 o series sintéticas (serial 9999...).
// Contrato: openspec/changes/parser-mrz-cedula-digital/specs/mrz-cedula-digital/spec.md, MZ-08.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { digitoControlIcao } from "../src/index.js";

const CIFRAS = "0123456789".split("");
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ALFABETO_MRZ = [...CIFRAS, ...LETRAS, "<"];

// Propiedades con numRuns >= 1000: margen para la instrumentación de cobertura y Stryker con agentes en paralelo.
describe("MZ-08 dígito de control ICAO 9303", { timeout: 60_000 }, () => {
  it("MZ-08 Ejemplos de ICAO Doc 9303", () => {
    expect(digitoControlIcao("D23145890")).toBe(7);
    expect(digitoControlIcao("740812")).toBe(2);
    expect(digitoControlIcao("120415")).toBe(9);
    expect(digitoControlIcao("L898902C3")).toBe(6);
  });

  it("MZ-08 Relleno y cadena vacía", () => {
    expect(digitoControlIcao("<<<<<<<<<")).toBe(0);
    expect(digitoControlIcao("")).toBe(0);
    expect(digitoControlIcao("999900123")).toBe(8);
  });

  it("MZ-08 Entradas fuera del alfabeto", () => {
    expect(digitoControlIcao("99990012x")).toBeNull();
    expect(digitoControlIcao("Ñ")).toBeNull();
    expect(digitoControlIcao("9 9")).toBeNull();
    expect(digitoControlIcao(42)).toBeNull();
  });

  it("MZ-08 valores de las letras extremas y del relleno con cada peso (A=10, Z=35, <=0)", () => {
    // Pesos 7, 3, 1: A en cada posición y Z en cada posición (valores literales calculados a mano).
    expect(digitoControlIcao("A")).toBe(0); // 10*7 = 70
    expect(digitoControlIcao("<A")).toBe(0); // 10*3 = 30
    expect(digitoControlIcao("<<A")).toBe(0); // 10*1 = 10
    expect(digitoControlIcao("Z")).toBe(5); // 35*7 = 245
    expect(digitoControlIcao("<Z")).toBe(5); // 35*3 = 105
    expect(digitoControlIcao("<<Z")).toBe(5); // 35*1 = 35
    expect(digitoControlIcao("B")).toBe(7); // 11*7 = 77
    expect(digitoControlIcao("<B")).toBe(3); // 11*3 = 33
    expect(digitoControlIcao("<<B")).toBe(1); // 11*1 = 11
    expect(digitoControlIcao("<<<1")).toBe(7); // el cuarto carácter vuelve a pesar 7
    expect(digitoControlIcao("9")).toBe(3); // 9*7 = 63
  });

  it("MZ-08 rechaza caracteres vecinos del alfabeto y valores no string", () => {
    for (const c of ["@", "[", "/", ":", ";", "=", ">", "a", "z", "\u00AB", "\u00A0"]) {
      expect(digitoControlIcao(`99${c}`)).toBeNull();
    }
    for (const v of [null, undefined, ["9"], { length: 1 }, new String("9")]) {
      expect(digitoControlIcao(v)).toBeNull();
    }
  });

  it("MZ-08 Toda sustitución de una cifra cambia el dígito", () => {
    const caso = fc
      .array(fc.constantFrom(...CIFRAS), { minLength: 1, maxLength: 30 })
      .chain((cifras) =>
        fc.record({
          cifras: fc.constant(cifras),
          posicion: fc.integer({ min: 0, max: cifras.length - 1 }),
          desplazamiento: fc.integer({ min: 1, max: 9 }),
        }),
      );
    fc.assert(
      fc.property(caso, ({ cifras, posicion, desplazamiento }) => {
        const original = cifras.join("");
        const alterada = [...cifras];
        alterada[posicion] = String((Number(cifras[posicion]) + desplazamiento) % 10);
        const dOriginal = digitoControlIcao(original);
        const dAlterada = digitoControlIcao(alterada.join(""));
        expect(dOriginal).not.toBeNull();
        expect(dAlterada).not.toBeNull();
        expect(dAlterada).not.toBe(dOriginal);
      }),
      { numRuns: 1000 },
    );
  });

  it("MZ-08 El relleno final no cambia el dígito", () => {
    const caso = fc.record({
      texto: fc.array(fc.constantFrom(...ALFABETO_MRZ), { maxLength: 27 }).map((p) => p.join("")),
      relleno: fc.integer({ min: 1, max: 3 }),
    });
    fc.assert(
      fc.property(caso, ({ texto, relleno }) => {
        const d = digitoControlIcao(texto);
        expect(d).not.toBeNull();
        expect(digitoControlIcao(texto + "<".repeat(relleno))).toBe(d);
      }),
      { numRuns: 1000 },
    );
  });

  it("MZ-08 toda cadena del alfabeto MRZ da una cifra de 0 a 9; con un carácter ajeno da null", () => {
    const ajeno = fc
      .string({ unit: "binary", minLength: 1, maxLength: 1 })
      .filter((c) => !ALFABETO_MRZ.includes(c));
    const caso = fc.record({
      prefijo: fc.array(fc.constantFrom(...ALFABETO_MRZ), { maxLength: 15 }).map((p) => p.join("")),
      sufijo: fc.array(fc.constantFrom(...ALFABETO_MRZ), { maxLength: 15 }).map((p) => p.join("")),
      ajeno,
    });
    fc.assert(
      fc.property(caso, ({ prefijo, sufijo, ajeno: c }) => {
        const d = digitoControlIcao(prefijo + sufijo);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(9);
        expect(digitoControlIcao(prefijo + c + sufijo)).toBeNull();
      }),
      { numRuns: 1000 },
    );
  });
});
