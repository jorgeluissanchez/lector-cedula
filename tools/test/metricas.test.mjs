import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { agregar, cer, construirCasos, levenshtein, mismoModo, regresiones } from "../../evals/runners/metricas.mjs";

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

describe("EV-03 Caída del número de casos", () => {
  const baseX = { "tipo-x": { a: { n: 40, exact_match: 1, cer: 0 } } };

  it("EV-03 Caída de n (atrapa: fixtures borrados sin aviso)", () => {
    const r = regresiones({ "tipo-x": { a: { n: 39, exact_match: 1, cer: 0 } } }, baseX);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("tipo-x.a");
    expect(r[0]).toContain("40");
    expect(r[0]).toContain("39");
  });

  it("EV-03 n igual o mayor (atrapa: falso positivo al añadir fixtures)", () => {
    expect(regresiones({ "tipo-x": { a: { n: 40, exact_match: 1, cer: 0 } } }, baseX)).toStrictEqual([]);
    expect(regresiones({ "tipo-x": { a: { n: 41, exact_match: 1, cer: 0 } } }, baseX)).toStrictEqual([]);
  });

  it("EV-03 Caída de n junto con caída de exact match (atrapa: una comprobación que oculta a la otra)", () => {
    const r = regresiones({ "tipo-x": { a: { n: 39, exact_match: 0.5, cer: 0 } } }, baseX);
    expect(r).toHaveLength(2);
    expect(r.filter((m) => /\bn\b/.test(m) && m.includes("40") && m.includes("39"))).toHaveLength(1);
    expect(r.filter((m) => m.includes("exact_match"))).toHaveLength(1);
  });

  it("EV-03 la caída de n no se evalúa con compararN false (atrapa: modo distinto tratado como regresión)", () => {
    expect(regresiones({ "tipo-x": { a: { n: 39, exact_match: 1, cer: 0 } } }, baseX, { compararN: false })).toStrictEqual([]);
    const r = regresiones({ "tipo-x": { a: { n: 39, exact_match: 0.5, cer: 0 } } }, baseX, { compararN: false });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("exact_match");
  });

  it("EV-03 mismoModo: solo el mismo modo o un baseline sin modo comparan n (atrapa: comparar quick con completo)", () => {
    expect(mismoModo(undefined, "quick")).toBe(true);
    expect(mismoModo(undefined, "completo")).toBe(true);
    expect(mismoModo("quick", "quick")).toBe(true);
    expect(mismoModo("completo", "completo")).toBe(true);
    expect(mismoModo("completo", "quick")).toBe(false);
    expect(mismoModo("quick", "completo")).toBe(false);
  });

  it("EV-03 mismoModo: un baseline con modo null cuenta como sin modo y compara n (atrapa: null tratado como modo distinto)", () => {
    expect(mismoModo(null, "quick")).toBe(true);
    expect(mismoModo(null, "completo")).toBe(true);
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

  it("EV-01 Clave con valor undefined cuenta como sobrante (atrapa: comparar claves vía JSON, que omite undefined)", () => {
    const m = agregar([
      {
        tipo: "t",
        clavesExactas: true,
        esperado: { valido: false, motivo: "vacio" },
        obtenido: { valido: false, motivo: "vacio", numero: undefined },
      },
    ]);
    expect(m.t.__claves).toStrictEqual({ n: 1, exact_match: 0, cer: 1 });
    expect(m.t.valido).toStrictEqual({ n: 1, exact_match: 1, cer: 0 });
    expect(m.t.motivo).toStrictEqual({ n: 1, exact_match: 1, cer: 0 });
  });

  it("EV-01 Solo el booleano true activa la comparación (atrapa: marca evaluada por veracidad)", () => {
    const m = agregar(
      ["true", 1, {}].map((clavesExactas) => ({
        tipo: "t",
        clavesExactas,
        esperado: { valido: false },
        obtenido: { valido: false, numero: "9999" },
      })),
    );
    expect(Object.hasOwn(m.t, "__claves")).toBe(false);
    expect(m.t.valido).toStrictEqual({ n: 3, exact_match: 1, cer: 0 });
  });
});

describe("EV-05 Esperado inválido", () => {
  it("EV-05 Agregación con esperado nulo (atrapa: TypeError del motor sin el tipo)", () => {
    let error;
    try {
      agregar([{ tipo: "tipo-x", esperado: null, obtenido: {} }]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TypeError);
    expect(error.message).toContain("tipo-x");
    expect(error.message).toContain("esperado");
  });

  it.each([
    ["array", []],
    ["texto", "x"],
    ["undefined", undefined],
    ["número", 1],
  ])("EV-05 Agregación con esperado %s también lanza con el tipo (atrapa: validar solo null)", (_nombre, esperado) => {
    const llamar = () => agregar([{ tipo: "tipo-x", esperado, obtenido: {} }]);
    expect(llamar).toThrow(/tipo-x/);
    expect(llamar).toThrow(/esperado/);
  });
});

describe("construirCasos (EV-01, EV-05)", () => {
  const ESPERADO = { valido: true, numero: "9999123456" };

  function evaluadorContador(resultado = { valido: true, numero: "9999123456" }) {
    const llamadas = [];
    const evaluar = (tipo, entrada, opciones) => {
      llamadas.push([tipo, entrada, opciones]);
      return resultado;
    };
    return { evaluar, llamadas };
  }

  it("EV-01 copia clavesExactas solo si es el booleano true (atrapa: el corredor pierde o reinterpreta la marca)", () => {
    const fixtures = [true, "true", 1, undefined].map((clavesExactas, i) => ({
      ruta: `f${i}.json`,
      tipo: "tipo-x",
      entrada: "9999123456",
      esperado: ESPERADO,
      ...(clavesExactas === undefined ? {} : { clavesExactas }),
    }));
    const { evaluar } = evaluadorContador();
    const { casos, errores } = construirCasos(fixtures, evaluar);
    expect(errores).toStrictEqual([]);
    expect(casos.map((c) => c.clavesExactas)).toStrictEqual([true, false, false, false]);
  });

  it("construye cada caso con tipo, esperado y el resultado del evaluador (atrapa: argumentos u orden cambiados)", () => {
    const { evaluar, llamadas } = evaluadorContador({ valido: false, motivo: "vacio" });
    const fixtures = [
      { ruta: "a.json", tipo: "tipo-x", entrada: "", esperado: { valido: false, motivo: "vacio" } },
      { ruta: "b.json", tipo: "tipo-y", entrada: "9999123456", opciones: { tipoDocumento: "ti" }, esperado: ESPERADO, clavesExactas: true },
    ];
    const { casos, errores } = construirCasos(fixtures, evaluar);
    expect(llamadas).toStrictEqual([
      ["tipo-x", "", undefined],
      ["tipo-y", "9999123456", { tipoDocumento: "ti" }],
    ]);
    expect(casos).toStrictEqual([
      { tipo: "tipo-x", esperado: { valido: false, motivo: "vacio" }, obtenido: { valido: false, motivo: "vacio" }, clavesExactas: false },
      { tipo: "tipo-y", esperado: ESPERADO, obtenido: { valido: false, motivo: "vacio" }, clavesExactas: true },
    ]);
    expect(errores).toStrictEqual([]);
  });

  it.each([
    ["a.json", null],
    ["b.json", []],
    ["c.json", "x"],
    ["d.json", undefined],
  ])("EV-05 Esperado nulo, array o texto: %s falla sin invocar al evaluador (atrapa: TypeError o evaluación previa)", (ruta, esperado) => {
    const { evaluar, llamadas } = evaluadorContador();
    const fixtures = [
      { ruta: "valido.json", tipo: "tipo-x", entrada: "9999123456", esperado: ESPERADO },
      { ruta, tipo: "tipo-x", entrada: "9999123456", esperado },
    ];
    let error;
    try {
      construirCasos(fixtures, evaluar);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TypeError);
    expect(error.message).toContain(ruta);
    expect(error.message).toContain("tipo-x");
    expect(error.message).toContain("esperado");
    expect(llamadas).toHaveLength(0);
  });

  it("recoge la excepción del evaluador en errores con la ruta y sigue con los demás (atrapa: un caso que tumba el corredor)", () => {
    const evaluar = (_tipo, entrada) => {
      if (entrada === "explota") throw new Error("fallo sintético");
      return { valido: true, numero: "9999123456" };
    };
    const fixtures = [
      { ruta: "x/explota.json", tipo: "tipo-x", entrada: "explota", esperado: ESPERADO },
      { ruta: "x/bien.json", tipo: "tipo-x", entrada: "9999123456", esperado: ESPERADO },
    ];
    const { casos, errores } = construirCasos(fixtures, evaluar);
    expect(errores).toStrictEqual(["x/explota.json: fallo sintético"]);
    expect(casos).toStrictEqual([
      { tipo: "tipo-x", esperado: ESPERADO, obtenido: {}, clavesExactas: false },
      { tipo: "tipo-x", esperado: ESPERADO, obtenido: { valido: true, numero: "9999123456" }, clavesExactas: false },
    ]);
  });

  it("sin fixtures devuelve listas vacías", () => {
    expect(construirCasos([], () => ({}))).toStrictEqual({ casos: [], errores: [] });
  });
});

// Pruebas de la tarea 6.1 (design.md, decisión 14): cada una nombra el mutante de Stryker que atrapa.
describe("Mutación de metricas.mjs: levenshtein y CER", () => {
  /** Oráculo independiente: definición recursiva de la distancia de edición, con memoria. */
  function levenshteinRecursivo(a, b) {
    const memo = new Map();
    const d = (i, j) => {
      if (i === 0) return j;
      if (j === 0) return i;
      const k = `${i},${j}`;
      if (!memo.has(k)) {
        memo.set(k, Math.min(d(i - 1, j) + 1, d(i, j - 1) + 1, d(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1)));
      }
      return memo.get(k);
    };
    return d(a.length, b.length);
  }

  it("levenshtein coincide con la definición recursiva, incluidas cadenas iguales y vacías (demuestra que la variante false de los atajos de levenshtein es equivalente y atrapa la variante true)", () => {
    const corta = fc.string({ unit: fc.constantFrom("a", "b"), maxLength: 6 });
    // Un tercio de pares cualesquiera, un tercio de cadenas iguales y un tercio con una cadena vacía.
    const par = fc.oneof(
      fc.tuple(corta, corta),
      corta.map((a) => [a, a]),
      fc.tuple(corta, fc.boolean()).map(([a, izquierda]) => (izquierda ? ["", a] : [a, ""])),
    );
    let iguales = 0;
    let vacias = 0;
    fc.assert(
      fc.property(par, ([a, b]) => {
        if (a === b) iguales += 1;
        if (a.length === 0 || b.length === 0) vacias += 1;
        expect(levenshtein(a, b)).toBe(levenshteinRecursivo(a, b));
      }),
      { numRuns: 1000 },
    );
    expect(iguales).toBeGreaterThanOrEqual(200);
    expect(vacias).toBeGreaterThanOrEqual(200);
  });

  it("CER con referencia vacía o ausente: 0 si el obtenido también lo es y 1 si no (atrapa: cer línea 25 `if (false)` que da NaN, `true ? 0 : 1`, `false ? 0 : 1`, `hyp.length !== 0`, y línea 23 `false ? \"\"` y \"Stryker was here!\")", () => {
    expect(cer("", "")).toBe(0);
    expect(cer(undefined, null)).toBe(0);
    expect(cer(null, undefined)).toBe(0);
    expect(cer("", null)).toBe(0);
    expect(cer("A", "")).toBe(1);
    expect(cer("A", null)).toBe(1);
  });

  it("un obtenido nulo o ausente no coincide con los textos \"null\" ni \"undefined\" (atrapa: cer línea 24 `false ? \"\"` y \"Stryker was here!\")", () => {
    expect(cer(null, "null")).toBe(1);
    expect(cer(undefined, "undefined")).toBe(1);
  });
});

describe("Mutación de metricas.mjs: agregar", () => {
  it("campo no textual: CER 0 si coincide y 1 si no, aunque su texto se parezca (atrapa: línea 81 `true ? cer(...)`, `typeof valor !== \"string\"`, `typeof real !== \"string\"` y `: true ? 0 : 1`)", () => {
    const m = agregar([
      { tipo: "t", esperado: { ok: false, d: 10 }, obtenido: { ok: true, d: 1 } },
      { tipo: "t", esperado: { ok: false, d: 10 }, obtenido: { ok: false, d: 10 } },
    ]);
    expect(m.t.ok).toStrictEqual({ n: 2, exact_match: 0.5, cer: 0.5 });
    expect(m.t.d).toStrictEqual({ n: 2, exact_match: 0.5, cer: 0.5 });
  });

  it("texto frente a no texto: CER sobre el texto y sin exact match, en ambos sentidos (atrapa: línea 81 `&&` en lugar de `||`, `false || ...`, `... || false` y `typeof ... === \"\"`)", () => {
    const m = agregar([
      { tipo: "t", esperado: { numero: "12345" }, obtenido: { numero: 1234 } },
      { tipo: "t", esperado: { digitos: 1234 }, obtenido: { digitos: "12345" } },
    ]);
    expect(m.t.numero).toStrictEqual({ n: 1, exact_match: 0, cer: 0.2 });
    expect(m.t.digitos).toStrictEqual({ n: 1, exact_match: 0, cer: 0.25 });
  });

  it("exact match: un valor no serializable no coincide con un campo esperado ausente (atrapa: normalizar línea 30 `false ? null`, porque JSON.stringify de una función también es undefined)", () => {
    const m = agregar([{ tipo: "t", esperado: { a: undefined }, obtenido: { a: () => 0 } }]);
    expect(m.t.a).toStrictEqual({ n: 1, exact_match: 0, cer: 1 });
  });

  it("EV-01 un resultado que no es objeto tiene el conjunto vacío y coincide con un esperado sin claves (atrapa: clavesOrdenadas línea 38 con conjunto no vacío para no objetos)", () => {
    const m = agregar([null, undefined, "x", 7].map((obtenido) => ({ tipo: "t", clavesExactas: true, esperado: {}, obtenido })));
    expect(m.t).toStrictEqual({ __claves: { n: 4, exact_match: 1, cer: 0 } });
  });

  it.each([
    ["null", null],
    ["array", []],
    ["string", "x"],
    ["undefined", undefined],
    ["number", 1],
  ])("EV-05 el mensaje nombra el tipo recibido: %s (atrapa: describirTipo líneas 47 a 49 vacío, con condiciones fijas o que confunde null y array con object)", (nombre, esperado) => {
    expect(() => agregar([{ tipo: "tipo-x", esperado, obtenido: {} }])).toThrow(`no es un objeto: es ${nombre} (EV-05)`);
  });
});

describe("Mutación de metricas.mjs: regresiones", () => {
  const base = { t: { a: { n: 2, exact_match: 1, cer: 0 } } };

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["vacío", {}],
  ])("EV-03 con métricas actuales %s cada campo del baseline desaparece, con tipo.campo y n (atrapa: línea 150 `actual[tipo]` sin `?.` y mensaje de la línea 152 vacío)", (_nombre, actual) => {
    const r = regresiones(actual, base);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("t.a");
    expect(r[0]).toContain("desapareció");
    expect(r[0]).toContain("n=2");
  });

  it("con tolerancia 0 un empate exacto no es regresión (atrapa: línea 158 `<=` y línea 161 `>=`)", () => {
    expect(regresiones({ t: { a: { n: 2, exact_match: 1, cer: 0 } } }, base, { tolerancia: 0 })).toStrictEqual([]);
  });

  it("la tolerancia por defecto absorbe ruido de punto flotante y con tolerancia 0 se reporta (atrapa: tolerancia ignorada)", () => {
    const ruido = { t: { a: { n: 2, exact_match: 1 - 1e-12, cer: 1e-12 } } };
    expect(regresiones(ruido, base)).toStrictEqual([]);
    expect(regresiones(ruido, base, { tolerancia: 0 })).toHaveLength(2);
  });

  it("el mensaje de subida de CER nombra tipo.campo y los dos valores (atrapa: mensaje de la línea 162 vacío)", () => {
    const r = regresiones({ t: { a: { n: 2, exact_match: 1, cer: 0.125 } } }, base);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("t.a");
    expect(r[0]).toContain("CER");
    expect(r[0]).toContain("0.0000");
    expect(r[0]).toContain("0.1250");
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
