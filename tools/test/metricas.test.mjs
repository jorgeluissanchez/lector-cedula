import { describe, expect, it } from "vitest";
import { agregar, cer, levenshtein, regresiones } from "../../evals/runners/metricas.mjs";

describe("levenshtein y cer", () => {
  it("calcula distancias conocidas", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
  it("CER es 0 en coincidencia exacta y 1 si falta el valor", () => {
    expect(cer("GONZALEZ", "GONZALEZ")).toBe(0);
    expect(cer(undefined, "GONZALEZ")).toBe(1);
    expect(cer("GONZALES", "GONZALEZ")).toBeCloseTo(1 / 8);
  });
});

describe("agregar", () => {
  it("calcula exact match y CER por tipo y campo", () => {
    const m = agregar([
      { tipo: "t", esperado: { a: "ABC", ok: true }, obtenido: { a: "ABC", ok: true } },
      { tipo: "t", esperado: { a: "ABC", ok: true }, obtenido: { a: "ABD", ok: false } },
    ]);
    expect(m.t.a.exact_match).toBe(0.5);
    expect(m.t.a.cer).toBeCloseTo(1 / 6);
    expect(m.t.ok.exact_match).toBe(0.5);
  });
});

describe("regresiones", () => {
  const base = { t: { a: { n: 2, exact_match: 1, cer: 0 } } };
  it("no reporta nada si no empeora", () => {
    expect(regresiones({ t: { a: { n: 3, exact_match: 1, cer: 0 } } }, base)).toEqual([]);
  });
  it("reporta caída de exact match y subida de CER", () => {
    expect(regresiones({ t: { a: { n: 2, exact_match: 0.5, cer: 0.1 } } }, base)).toHaveLength(2);
  });
  it("reporta campos que desaparecen", () => {
    expect(regresiones({}, base)).toHaveLength(1);
  });
});
