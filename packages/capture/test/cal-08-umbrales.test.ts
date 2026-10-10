import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crearConfiguracionUmbrales, UMBRALES_POR_DEFECTO, validarUmbrales, type Umbrales } from "../src/calidad/umbrales.js";

const DEFECTO_LITERAL = {
  laplacianoDesenfocado: 8,
  laplacianoNitido: 35,
  luminanciaSaturada: 250,
  fraccionSaturadaMax: 0.05,
  componenteSaturadoMax: 0.02,
  luminanciaOscura: 5,
  fraccionOscuraMax: 0.25,
  mediaNegra: 20,
  mediaOscuraOk: 60,
  mediaClaraOk: 200,
  mediaBlanca: 240,
  ratioMinimo: 0.1,
  ratioOk: 0.3,
  umbralListo: 70,
  framesConsecutivos: 3,
  intervaloMinimoMs: 100,
};
const CLAVES = Object.keys(DEFECTO_LITERAL);

function campos(parcial: unknown): readonly string[] | "ok" {
  const r = validarUmbrales(parcial, UMBRALES_POR_DEFECTO);
  return r.ok ? "ok" : r.campos;
}

describe("CAL-08 Umbrales calibrables", { timeout: 60_000 }, () => {
  it("CAL-08 Valores por defecto", () => {
    expect({ ...UMBRALES_POR_DEFECTO }).toStrictEqual(DEFECTO_LITERAL);
    expect(Object.isFrozen(UMBRALES_POR_DEFECTO)).toBe(true);
    expect(crearConfiguracionUmbrales().umbrales).toStrictEqual(UMBRALES_POR_DEFECTO);
  });

  it("CAL-08 Configuración inválida", () => {
    const config = crearConfiguracionUmbrales();
    expect(config.configurar({ umbralListo: 101, framesConsecutivos: 0, laplacianoNitido: 5, extra: 1 })).toStrictEqual({
      ok: false,
      codigo: "umbrales-invalidos",
      campos: ["extra", "framesConsecutivos", "laplacianoNitido", "umbralListo"],
    });
    expect({ ...config.umbrales }).toStrictEqual(DEFECTO_LITERAL);
  });

  it("CAL-08 Sustitución parcial (configuración)", () => {
    const config = crearConfiguracionUmbrales();
    expect(config.configurar({ umbralListo: 80 })).toStrictEqual({ ok: true });
    expect({ ...config.umbrales }).toStrictEqual({ ...DEFECTO_LITERAL, umbralListo: 80 });
    // Las sustituciones se acumulan sobre los vigentes y una inválida posterior no los cambia.
    expect(config.configurar({ framesConsecutivos: 5 })).toStrictEqual({ ok: true });
    expect(config.configurar({ framesConsecutivos: 31 })).toStrictEqual({ ok: false, codigo: "umbrales-invalidos", campos: ["framesConsecutivos"] });
    expect({ ...config.umbrales }).toStrictEqual({ ...DEFECTO_LITERAL, umbralListo: 80, framesConsecutivos: 5 });
    expect(Object.isFrozen(config.umbrales)).toBe(true);
  });

  it("CAL-08 Reglas de validez: rangos por campo", () => {
    const validos: Record<string, readonly number[]> = {
      luminanciaSaturada: [0, 255],
      luminanciaOscura: [0, 255],
      mediaNegra: [0, 19.5],
      mediaOscuraOk: [20.5, 199],
      mediaClaraOk: [60.5, 239],
      mediaBlanca: [200.5, 255],
      fraccionSaturadaMax: [0.0001, 1],
      componenteSaturadoMax: [0.0001, 1],
      fraccionOscuraMax: [0.0001, 1],
      ratioMinimo: [0.0001, 0.29],
      ratioOk: [0.11, 1],
      laplacianoDesenfocado: [0, 34.5],
      laplacianoNitido: [8.5, 1e9],
      umbralListo: [0, 100],
      framesConsecutivos: [1, 30],
      intervaloMinimoMs: [100, 150.5, 200],
    };
    const invalidos: Record<string, readonly unknown[]> = {
      luminanciaSaturada: [-1, 256, 250.5],
      luminanciaOscura: [-1, 256, 4.5],
      mediaNegra: [-0.1, 255.1],
      mediaOscuraOk: [-1, 256],
      mediaClaraOk: [-1, 256],
      mediaBlanca: [255.5, -1],
      fraccionSaturadaMax: [0, 1.01, -0.5],
      componenteSaturadoMax: [0, 1.01],
      fraccionOscuraMax: [0, 1.01],
      ratioMinimo: [0, 1.5],
      ratioOk: [0, 1.5],
      laplacianoDesenfocado: [-1],
      laplacianoNitido: [Number.NaN],
      umbralListo: [-1, 101, 70.5],
      framesConsecutivos: [0, 31, 2.5],
      intervaloMinimoMs: [99, 201],
    };
    for (const clave of CLAVES) {
      for (const v of validos[clave] ?? []) expect([clave, v, campos({ [clave]: v })]).toStrictEqual([clave, v, "ok"]);
      for (const v of [...(invalidos[clave] ?? []), Number.NaN, Number.POSITIVE_INFINITY, "1", null, true]) {
        expect([clave, v, campos({ [clave]: v })]).toStrictEqual([clave, v, [clave]]);
      }
    }
    expect(Object.keys(validos).sort()).toStrictEqual([...CLAVES].sort());
  });

  it("CAL-08 Reglas de validez: relaciones de orden tras combinar con los vigentes", () => {
    expect(campos({ laplacianoDesenfocado: 35 })).toStrictEqual(["laplacianoDesenfocado"]);
    expect(campos({ laplacianoNitido: 8 })).toStrictEqual(["laplacianoNitido"]);
    expect(campos({ laplacianoDesenfocado: 300, laplacianoNitido: 400 })).toBe("ok");
    expect(campos({ laplacianoDesenfocado: 400, laplacianoNitido: 300 })).toStrictEqual(["laplacianoDesenfocado", "laplacianoNitido"]);
    expect(campos({ mediaNegra: 60 })).toStrictEqual(["mediaNegra"]);
    expect(campos({ mediaOscuraOk: 200 })).toStrictEqual(["mediaOscuraOk"]);
    expect(campos({ mediaClaraOk: 240 })).toStrictEqual(["mediaClaraOk"]);
    expect(campos({ mediaBlanca: 200 })).toStrictEqual(["mediaBlanca"]);
    expect(campos({ mediaNegra: 100, mediaBlanca: 50 })).toStrictEqual(["mediaBlanca", "mediaNegra"]);
    expect(campos({ mediaNegra: 1, mediaOscuraOk: 2, mediaClaraOk: 3, mediaBlanca: 4 })).toBe("ok");
    expect(campos({ ratioMinimo: 0.3 })).toStrictEqual(["ratioMinimo"]);
    expect(campos({ ratioOk: 0.1 })).toStrictEqual(["ratioOk"]);
    expect(campos({ ratioMinimo: 0.5, ratioOk: 0.9 })).toBe("ok");
    // La relación de nitidez no arrastra campos ajenos: un fallo de orden lista solo los de su relación presentes.
    expect(campos({ laplacianoNitido: 5, umbralListo: 50 })).toStrictEqual(["laplacianoNitido"]);
    // Un campo inválido por rango y su relación: se lista una sola vez.
    expect(campos({ laplacianoDesenfocado: -5, laplacianoNitido: -10 })).toStrictEqual(["laplacianoDesenfocado", "laplacianoNitido"]);
    // La relación se evalúa con los vigentes, no con los valores por defecto.
    const r = validarUmbrales({ laplacianoNitido: 150 }, { ...UMBRALES_POR_DEFECTO, laplacianoDesenfocado: 160 });
    expect(r).toStrictEqual({ ok: false, codigo: "umbrales-invalidos", campos: ["laplacianoNitido"] });
  });

  it("CAL-08 Reglas de validez: campos desconocidos y entradas que no son objetos", () => {
    expect(campos({ extra: 1 })).toStrictEqual(["extra"]);
    expect(campos(JSON.parse('{"__proto__": {"umbralListo": 1}}'))).toStrictEqual(["__proto__"]);
    expect(campos({})).toBe("ok");
    expect(campos(Object.create({ umbralListo: 500 }))).toBe("ok");
    for (const entrada of [null, undefined, 5, "umbralListo", [], [1], () => 1]) expect(campos(entrada)).toStrictEqual([]);
  });

  it("CAL-08 La validación correcta devuelve los vigentes combinados y congelados, sin tocar la entrada", () => {
    const parcial = { umbralListo: 90 };
    const r = validarUmbrales(parcial, UMBRALES_POR_DEFECTO);
    expect(r).toStrictEqual({ ok: true, umbrales: { ...DEFECTO_LITERAL, umbralListo: 90 } });
    expect(r.ok && Object.isFrozen(r.umbrales)).toBe(true);
    expect(parcial).toStrictEqual({ umbralListo: 90 });
    expect(UMBRALES_POR_DEFECTO.umbralListo).toBe(70);
  });

  it("CAL-08 Cada valor por defecto está documentado con el mismo valor", () => {
    const doc = readFileSync(new URL("../../../docs/decisiones/2026-10-06-umbrales-calidad-captura.md", import.meta.url), "utf8");
    const tabla = new Map<string, number>();
    for (const m of doc.matchAll(/^\| `(\w+)` \| ([\d,]+) \|/gm)) tabla.set(m[1] ?? "", Number((m[2] ?? "").replace(",", ".")));
    expect(Object.fromEntries(CLAVES.map((k) => [k, tabla.get(k)]))).toStrictEqual(DEFECTO_LITERAL);
  });

  it("CAL-08 Propiedad: ninguna entrada hace lanzar y un error no cambia los vigentes", () => {
    let errores = 0;
    const entrada = fc.oneof(
      fc.anything(),
      fc.dictionary(fc.constantFrom(...CLAVES, "extra"), fc.oneof(fc.double(), fc.integer({ min: -10, max: 300 }), fc.anything())),
    );
    fc.assert(
      fc.property(entrada, (parcial) => {
        const config = crearConfiguracionUmbrales();
        const antes = { ...config.umbrales };
        const r = config.configurar(parcial);
        if (!r.ok) {
          errores++;
          expect(r.codigo).toBe("umbrales-invalidos");
          expect({ ...config.umbrales }).toStrictEqual(antes);
        }
      }),
      { numRuns: 1000 },
    );
    // No vacuidad: la propiedad ejerce la rama de error en una parte sustancial de los casos.
    expect(errores).toBeGreaterThan(500);
  });

  it("CAL-08 Propiedad: los parciales válidos por construcción se aceptan y se combinan", () => {
    const completoValido = fc.record({
      laplaciano: fc.tuple(fc.double({ min: 0, max: 1e4, noNaN: true }), fc.double({ min: 1, max: 1e4, noNaN: true })),
      medias: fc.uniqueArray(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 4 }),
      ratios: fc.uniqueArray(fc.integer({ min: 1, max: 1000 }), { minLength: 2, maxLength: 2 }),
      luminanciaSaturada: fc.integer({ min: 0, max: 255 }),
      luminanciaOscura: fc.integer({ min: 0, max: 255 }),
      fraccionSaturadaMax: fc.double({ min: 1e-6, max: 1, noNaN: true }),
      componenteSaturadoMax: fc.double({ min: 1e-6, max: 1, noNaN: true }),
      fraccionOscuraMax: fc.double({ min: 1e-6, max: 1, noNaN: true }),
      umbralListo: fc.integer({ min: 0, max: 100 }),
      framesConsecutivos: fc.integer({ min: 1, max: 30 }),
      intervaloMinimoMs: fc.double({ min: 100, max: 200, noNaN: true }),
      // Qué grupos entran en el parcial (las relaciones de orden entran completas o no entran).
      incluir: fc.array(fc.boolean(), { minLength: 11, maxLength: 11 }),
    });
    let noVacios = 0;
    fc.assert(
      fc.property(completoValido, (g) => {
        const [d, delta] = g.laplaciano;
        const medias = [...g.medias].sort((a, b) => a - b);
        const ratios = [...g.ratios].sort((a, b) => a - b).map((r) => r / 1000);
        const grupos: Record<string, number>[] = [
          { laplacianoDesenfocado: d, laplacianoNitido: d + delta },
          { mediaNegra: medias[0] ?? 0, mediaOscuraOk: medias[1] ?? 0, mediaClaraOk: medias[2] ?? 0, mediaBlanca: medias[3] ?? 0 },
          { ratioMinimo: ratios[0] ?? 0, ratioOk: ratios[1] ?? 0 },
          { luminanciaSaturada: g.luminanciaSaturada },
          { luminanciaOscura: g.luminanciaOscura },
          { fraccionSaturadaMax: g.fraccionSaturadaMax },
          { componenteSaturadoMax: g.componenteSaturadoMax },
          { fraccionOscuraMax: g.fraccionOscuraMax },
          { umbralListo: g.umbralListo },
          { framesConsecutivos: g.framesConsecutivos },
          { intervaloMinimoMs: g.intervaloMinimoMs },
        ];
        const parcial: Partial<Umbrales> = Object.assign({}, ...grupos.filter((_, i) => g.incluir[i]));
        if (Object.keys(parcial).length > 0) noVacios++;
        const r = validarUmbrales(parcial, UMBRALES_POR_DEFECTO);
        expect(r).toStrictEqual({ ok: true, umbrales: { ...DEFECTO_LITERAL, ...parcial } });
      }),
      { numRuns: 1000 },
    );
    expect(noVacios).toBeGreaterThanOrEqual(500);
  });
});
