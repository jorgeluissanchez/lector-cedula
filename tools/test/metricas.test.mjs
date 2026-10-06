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

describe("EV-01 Comparación exacta del conjunto de claves", () => {
  it("EV-01 Mismas claves", () => {
    const m = agregar([
      { tipo: "t", clavesExactas: true, esperado: { valido: false, motivo: "vacio" }, obtenido: { valido: false, motivo: "vacio" } },
    ]);
    expect(m.t.__claves).toStrictEqual({ n: 1, exact_match: 1, cer: 0 });
  });

  it("EV-01 Clave sobrante", () => {
    const m = agregar([
      {
        tipo: "t",
        clavesExactas: true,
        esperado: { valido: false, motivo: "vacio" },
        obtenido: { valido: false, motivo: "vacio", numero: "9999" },
      },
    ]);
    expect(m.t.__claves).toStrictEqual({ n: 1, exact_match: 0, cer: 1 });
    expect(m.t.valido.exact_match).toBe(1);
    expect(m.t.motivo.exact_match).toBe(1);
  });

  it("EV-01 Clave faltante", () => {
    const m = agregar([
      { tipo: "t", clavesExactas: true, esperado: { valido: true, numero: "9999123456" }, obtenido: { valido: true } },
    ]);
    expect(m.t.__claves).toStrictEqual({ n: 1, exact_match: 0, cer: 1 });
  });

  it("EV-01 El orden de las claves no importa", () => {
    const m = agregar([
      { tipo: "t", clavesExactas: true, esperado: { valido: false, motivo: "vacio" }, obtenido: { motivo: "vacio", valido: false } },
    ]);
    expect(m.t.__claves).toStrictEqual({ n: 1, exact_match: 1, cer: 0 });
  });

  it("EV-01 Resultado que no es objeto", () => {
    const m = agregar(
      [null, undefined, "x"].map((obtenido) => ({ tipo: "t", clavesExactas: true, esperado: { valido: false }, obtenido })),
    );
    expect(m.t.__claves).toStrictEqual({ n: 3, exact_match: 0, cer: 1 });
  });

  it("EV-01 Sin la marca no se compara", () => {
    const obtenido = { valido: false, motivo: "vacio", numero: "9999" };
    const m = agregar([
      { tipo: "t", esperado: { valido: false, motivo: "vacio" }, obtenido },
      { tipo: "t", clavesExactas: false, esperado: { valido: false, motivo: "vacio" }, obtenido },
    ]);
    expect(Object.hasOwn(m.t, "__claves")).toBe(false);
  });

  it("EV-01 Mezcla de casos con y sin marca", () => {
    const m = agregar([
      { tipo: "t", clavesExactas: true, esperado: { valido: false }, obtenido: { valido: false } },
      { tipo: "t", esperado: { valido: false }, obtenido: { valido: false } },
    ]);
    expect(m.t.__claves.n).toBe(1);
    expect(m.t.valido.n).toBe(2);
  });
});

describe("EV-02 Nombre de campo reservado", () => {
  it("EV-02 Esperado con la clave reservada", () => {
    const llamar = () => agregar([{ tipo: "t", esperado: { __claves: 1 }, obtenido: {} }]);
    expect(llamar).toThrow(Error);
    expect(llamar).toThrow(/__claves/);
    expect(llamar).toThrow(/"t"/);
  });
});
