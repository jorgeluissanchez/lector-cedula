// SDK-57 (corrección del usuario 2026-10-09): decidirFront(dispositivo, umbrales) pura y lectura de señales.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decidirFront, leerDispositivo, MOTIVOS_FRONT, UMBRALES_FRONT, type DispositivoLector } from "../../src/decidir-front.js";

const caso = (memoriaGb: number | undefined, nucleos: number, simd: boolean, red: "4g" | "2g" | "saveData" | undefined): DispositivoLector => ({
  ...(memoriaGb === undefined ? {} : { memoriaGb }),
  nucleos,
  simd,
  ...(red === undefined ? {} : red === "saveData" ? { ahorroDatos: true, tipoRed: "4g" } : { ahorroDatos: false, tipoRed: red }),
});

describe("SDK-57 decidirFront", () => {
  it("SDK-57 Tabla de decisión", () => {
    const casos = [
      caso(8, 8, true, "4g"),
      caso(2, 8, true, "4g"),
      caso(8, 2, true, "4g"),
      caso(8, 8, false, "4g"),
      caso(8, 8, true, "saveData"),
      caso(8, 8, true, "2g"),
      caso(2, 2, false, "2g"),
      caso(undefined, 8, true, undefined),
    ];
    expect(casos.map((c) => decidirFront(c, UMBRALES_FRONT))).toStrictEqual([
      { usarFront: true, motivo: "potente" },
      { usarFront: false, motivo: "memoria-baja" },
      { usarFront: false, motivo: "pocos-nucleos" },
      { usarFront: false, motivo: "sin-simd" },
      { usarFront: false, motivo: "ahorro-datos" },
      { usarFront: false, motivo: "red-lenta" },
      { usarFront: false, motivo: "memoria-baja" },
      { usarFront: true, motivo: "potente" },
    ]);
  });

  it("SDK-57 Umbrales configurables y límites exactos", () => {
    expect(decidirFront({ memoriaGb: 4 }, { memoriaMinGb: 8 })).toStrictEqual({ usarFront: false, motivo: "memoria-baja" });
    expect(decidirFront({ memoriaGb: 4, nucleos: 4 }, UMBRALES_FRONT)).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({ nucleos: 3 }, {})).toStrictEqual({ usarFront: false, motivo: "pocos-nucleos" });
    expect(decidirFront({ tipoRed: "slow-2g" }, {})).toStrictEqual({ usarFront: false, motivo: "red-lenta" });
    expect(decidirFront({ tipoRed: "3g" }, {})).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({ simd: false }, { simdRequerido: false })).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({ ahorroDatos: true }, { ahorroDatosDebil: false })).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({ tipoRed: "2g" }, { redesLentas: [] })).toStrictEqual({ usarFront: true, motivo: "potente" });
  });

  it("SDK-57 Micro-medición solo con umbral", () => {
    expect(decidirFront({ microMedicionMs: 500 }, {})).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({ microMedicionMs: 500 }, { microMedicionMaxMs: 100 })).toStrictEqual({ usarFront: false, motivo: "medicion-lenta" });
    expect(decidirFront({ microMedicionMs: 100 }, { microMedicionMaxMs: 100 })).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({}, { microMedicionMaxMs: 100 })).toStrictEqual({ usarFront: true, motivo: "potente" });
  });

  it("SDK-57 Señales ausentes o no numéricas no cuentan como débiles", () => {
    expect(decidirFront({ memoriaGb: Number.NaN, nucleos: Number.NaN }, {})).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront(undefined as unknown as DispositivoLector, undefined as unknown as object)).toStrictEqual({ usarFront: true, motivo: "potente" });
    expect(decidirFront({ memoriaGb: "2" as unknown as number }, {})).toStrictEqual({ usarFront: true, motivo: "potente" });
  });

  it("SDK-57 Propiedad de totalidad", () => {
    const num = fc.oneof(fc.constant(undefined), fc.constant(Number.NaN), fc.constant(Number.POSITIVE_INFINITY), fc.double({ min: -16, max: 64, noNaN: true }), fc.integer({ min: 4, max: 32 }));
    const dispositivo = fc.record(
      {
        memoriaGb: num,
        nucleos: num,
        simd: fc.oneof(fc.constant(undefined), fc.boolean(), fc.constant(true)),
        ahorroDatos: fc.oneof(fc.constant(undefined), fc.constant(false), fc.boolean()),
        tipoRed: fc.oneof(fc.constant(undefined), fc.constantFrom("4g", "3g", "2g", "slow-2g"), fc.string()),
        microMedicionMs: num,
      },
      { requiredKeys: [] },
    );
    const umbrales = fc.record(
      { memoriaMinGb: num, nucleosMin: num, simdRequerido: fc.boolean(), ahorroDatosDebil: fc.boolean(), redesLentas: fc.array(fc.string(), { maxLength: 3 }), microMedicionMaxMs: num },
      { requiredKeys: [] },
    );
    const muestra = fc.tuple(dispositivo as fc.Arbitrary<DispositivoLector>, umbrales);
    fc.statistics(muestra, ([d, u]) => (decidirFront(d, u).usarFront ? "potente" : "debil"), { numRuns: 1000, logger: (s) => void s });
    let potentes = 0;
    let total = 0;
    fc.assert(
      fc.property(muestra, ([d, u]) => {
        const r = decidirFront(d, u);
        total++;
        if (r.usarFront) potentes++;
        expect(typeof r.usarFront).toBe("boolean");
        expect(MOTIVOS_FRONT).toContain(r.motivo);
        expect(r.usarFront).toBe(r.motivo === "potente");
      }),
      { numRuns: 1000 },
    );
    expect(potentes / total).toBeGreaterThan(0.1);
    expect((total - potentes) / total).toBeGreaterThan(0.1);
  });
});

describe("SDK-57 leerDispositivo", () => {
  it("lee deviceMemory, hardwareConcurrency, connection y SIMD", () => {
    const nav = { deviceMemory: 2, hardwareConcurrency: 8, connection: { saveData: true, effectiveType: "3g" } };
    expect(leerDispositivo(nav, () => true)).toStrictEqual({ memoriaGb: 2, nucleos: 8, simd: true, ahorroDatos: true, tipoRed: "3g" });
  });

  it("Safari sin deviceMemory ni connection: solo las señales expuestas", () => {
    expect(leerDispositivo({ hardwareConcurrency: 8 }, () => false)).toStrictEqual({ nucleos: 8, simd: false });
  });

  it("sin navigator ni WebAssembly no lanza", () => {
    expect(leerDispositivo(null, () => {
      throw new Error("sin wasm");
    })).toStrictEqual({});
  });
});
