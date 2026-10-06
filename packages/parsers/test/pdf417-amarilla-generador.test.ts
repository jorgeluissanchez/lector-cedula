// fixture-sintetico: propiedades con el generador sintético @lector-cedula/fixtures (personas ficticias, NUIP 9999...).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PERSONA_BASE,
  VERSION_CONTRATO,
  arbFixturePdf417,
  arbPersonaFicticia,
  generarPdf417,
  type FixturePdf417,
  type PersonaFicticia,
  type VariantePdf417,
} from "@lector-cedula/fixtures";
import { parsearPdf417Amarilla } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import { problemasDeForma } from "./ayudas/forma-resultado.js";
import { C, C_F, S, W, bloqueSexoPrimero, latin1, sustituir, type PersonaReferencia } from "./ayudas/tramas-referencia.js";

const VARIANTES: readonly VariantePdf417[] = ["completa", "windows-truncada", "sin-pubdsk", "fecha-primero"];
/** Trama que el parser debe informar para cada variante del generador (PA-21, tabla literal). */
const TRAMA_ESPERADA: Record<VariantePdf417, object> = {
  completa: { variante: "completa", modo: "offsets", bloqueDemografico: "sexo-primero" },
  "windows-truncada": { variante: "truncada", modo: "patrones", bloqueDemografico: "sexo-primero" },
  "sin-pubdsk": { variante: "sin-pubdsk", modo: "patrones", bloqueDemografico: "sexo-primero" },
  "fecha-primero": { variante: "completa", modo: "patrones", bloqueDemografico: "fecha-primero" },
};
const RUNS = { numRuns: 1000 };
const N = String.fromCharCode(0xd1);

/** Traducción literal de `esperado` del generador a `campos` del parser (PA-21). */
function camposEsperados(f: FixturePdf417): object {
  const e = f.esperado;
  const sinDivipol = f.variante === "fecha-primero";
  return {
    numeroDocumento: e.nuip,
    primerApellido: e.primerApellido,
    segundoApellido: e.segundoApellido === "" ? null : e.segundoApellido,
    primerNombre: e.primerNombre,
    segundoNombre: e.segundoNombre === "" ? null : e.segundoNombre,
    sexo: e.sexo,
    fechaNacimiento: e.fechaNacimiento,
    rh: e.rh,
    codigoDepartamentoNacimiento: sinDivipol ? null : e.departamento,
    codigoMunicipioNacimiento: sinDivipol ? null : e.municipio,
  };
}

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

function aReferencia(p: PersonaFicticia): PersonaReferencia {
  return {
    campoNuip: p.nuip.padStart(10, "0"),
    apellido1: p.primerApellido,
    apellido2: p.segundoApellido,
    nombre1: p.primerNombre,
    nombre2: p.segundoNombre,
    sexo: p.sexo,
    fecha: p.fechaNacimiento.replaceAll("-", ""),
    depto: p.departamento,
    mpio: p.municipio,
    rh: p.rh,
  };
}

/** Rangos de la disposición de la spec (C, W, S y sufijo F), calculados desde las convenciones, no del generador. */
function rangosReferencia(p: PersonaReferencia, variante: VariantePdf417): Record<string, readonly [number, number] | null> {
  const largoBloque = (variante === "fecha-primero" ? 1 : 0) + bloqueSexoPrimero(p).length;
  const finBloque = 150 + largoBloque;
  const base: Record<string, readonly [number, number] | null> = {
    afis: [2, 10],
    marcador: [24, 32],
    nuip: [48, 58],
    primerApellido: [58, 81],
    segundoApellido: [81, 104],
    primerNombre: [104, 127],
    segundoNombre: [127, 150],
    bloqueDemografico: [150, finBloque],
    rh: [finBloque - p.rh.length, finBloque],
    cola: [finBloque, 531],
  };
  const mover = (corte: number, delta: number) =>
    Object.fromEntries(
      Object.entries(base).map(([k, r]) => [k, r !== null && r[0] >= corte ? ([r[0] + delta, r[1] + delta] as const) : r]),
    );
  if (variante === "windows-truncada") return mover(24, -11);
  if (variante === "sin-pubdsk") {
    const movidos = mover(32, 1);
    return { ...movidos, marcador: null, cola: [(movidos.cola as readonly [number, number])[0], 531] };
  }
  return base;
}

function tramaReferencia(p: PersonaReferencia, variante: VariantePdf417): Uint8Array {
  if (variante === "windows-truncada") return W(p);
  if (variante === "sin-pubdsk") return S(p);
  if (variante === "fecha-primero") return C_F(p);
  return C(p);
}

describe("PA-21 Contrato del generador y tramas de referencia", () => {
  it("PA-21 VERSION_CONTRATO es 1.0.0 (atrapa: contrato del generador cambiado sin revisar el parser)", () => {
    expect(VERSION_CONTRATO, "el contrato de @lector-cedula/fixtures cambió: revisa PA-21 y el ayudante").toBe("1.0.0");
  });

  it("PA-21 Los rangos del generador coinciden con la disposición de la spec (atrapa: ayudante y generador divergentes)", () => {
    const p = aReferencia(PERSONA_BASE);
    for (const variante of VARIANTES) {
      const f = generarPdf417(PERSONA_BASE, { variante, semilla: 1 });
      expect([variante, f.rangos]).toStrictEqual([variante, rangosReferencia(p, variante)]);
      expect(f.bytes.length).toBe(tramaReferencia(p, variante).length);
      const ref = tramaReferencia(p, variante);
      const iguales = (r: readonly [number, number]) => [...f.bytes.subarray(r[0], r[1])].join() === [...ref.subarray(r[0], r[1])].join();
      for (const campo of ["nuip", "primerApellido", "segundoApellido", "primerNombre", "segundoNombre", "rh"] as const) {
        expect([variante, campo, iguales(f.rangos[campo])]).toStrictEqual([variante, campo, true]);
      }
      const [ib, fb] = f.rangos.bloqueDemografico;
      const sinDesconocido = (b: Uint8Array) => [...b.subarray(ib, fb)].filter((_, i) => i !== fb - ib - p.rh.length - 1).join();
      expect([variante, sinDesconocido(f.bytes)]).toStrictEqual([variante, sinDesconocido(ref)]);
    }
  });
});

describe("PA-21 Ida y vuelta con el generador sintético", { timeout: 120_000 }, () => {
  for (const variante of VARIANTES) {
    it(`PA-21 Ida y vuelta por variante: ${variante} (atrapa: cualquier campo mal leído en la variante)`, () => {
      const n = { total: 0, sinSegundoNombre: 0, espacio: 0, enie: 0, ab: 0, negativo: 0, nuipCorto: 0 };
      fc.assert(
        fc.property(arbFixturePdf417({ variantes: [variante], nuipCorto: true }), (f) => {
          const e = f.esperado;
          const nombres = [e.primerApellido, e.segundoApellido, e.primerNombre, e.segundoNombre];
          n.total++;
          if (e.segundoNombre === "") n.sinSegundoNombre++;
          if (nombres.some((x) => x.includes(" "))) n.espacio++;
          if (nombres.some((x) => x.includes(N))) n.enie++;
          if (e.rh.startsWith("AB")) n.ab++;
          if (e.rh.endsWith("-")) n.negativo++;
          if (e.nuip.length < 10) n.nuipCorto++;
          const r = exito(parsearPdf417Amarilla(f.bytes));
          expect(r.trama).toStrictEqual(TRAMA_ESPERADA[variante]);
          expect(r.campos).toStrictEqual(camposEsperados(f));
        }),
        RUNS,
      );
      expect(n.sinSegundoNombre / n.total).toBeGreaterThanOrEqual(0.08);
      expect(n.espacio / n.total).toBeGreaterThanOrEqual(0.08);
      expect(n.enie / n.total).toBeGreaterThanOrEqual(0.2);
      expect(n.ab / n.total).toBeGreaterThanOrEqual(0.1);
      expect(n.negativo / n.total).toBeGreaterThanOrEqual(0.25);
      expect(n.nuipCorto / n.total).toBeGreaterThanOrEqual(0.4);
    });
  }

  it("PA-21 Nombres largos en la trama completa (atrapa: exigir relleno NUL tras un nombre de 22 o 23 bytes)", () => {
    const largo = fc
      .integer({ min: 22, max: 23 })
      .chain((k) => fc.string({ unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"), minLength: k, maxLength: k }));
    const campos = ["primerApellido", "segundoApellido", "primerNombre", "segundoNombre"] as const;
    let total = 0;
    let con23 = 0;
    fc.assert(
      fc.property(arbPersonaFicticia(), fc.subarray([...campos], { minLength: 1 }), fc.array(largo, { minLength: 4, maxLength: 4 }), (otra, elegidos, largos) => {
        const persona: PersonaFicticia = { ...PERSONA_BASE };
        const nombres: Record<string, string> = {};
        campos.forEach((c, i) => (nombres[c] = elegidos.includes(c) ? (largos[i] ?? "") : otra[c]));
        const f = generarPdf417({ ...persona, ...nombres } as PersonaFicticia, { variante: "completa" });
        total++;
        if (Object.values(nombres).some((x) => x.length === 23)) con23++;
        const r = exito(parsearPdf417Amarilla(f.bytes));
        expect(r.trama.modo).toBe("offsets");
        expect(r.campos).toStrictEqual(camposEsperados(f));
      }),
      RUNS,
    );
    expect(con23 / total).toBeGreaterThanOrEqual(0.25);
  });
});

describe("PA-16, PA-08, PA-19 y PA-04 Propiedades con el generador", { timeout: 120_000 }, () => {
  for (const variante of VARIANTES) {
    it(`PA-16 Propiedad de independencia de la cola: ${variante} (atrapa: leer biometría)`, () => {
      fc.assert(
        fc.property(
          arbFixturePdf417({ variantes: [variante] }),
          fc.uint8Array({ maxLength: 1500 }),
          fc.uint8Array({ maxLength: 1500 }),
          (f, colaA, colaB) => {
            const inicio = f.rangos.cola[0];
            const a = Uint8Array.from([...f.bytes.subarray(0, inicio), ...colaA]);
            const b = Uint8Array.from([...f.bytes.subarray(0, inicio), ...colaB]);
            const ra = parsearPdf417Amarilla(a);
            expect(ra.ok).toBe(true);
            expect(parsearPdf417Amarilla(b)).toStrictEqual(ra);
          },
        ),
        RUNS,
      );
    });
  }

  it("PA-08 y PA-20 Metamórfica: misma persona en completa, truncada y sin PubDSK da los mismos campos (atrapa: lectura que depende de la variante)", () => {
    let total = 0;
    let sinSegundoNombre = 0;
    let enie = 0;
    fc.assert(
      fc.property(arbPersonaFicticia({ nuipCorto: true }), fc.integer({ min: 0, max: 0xffffffff }), (persona, semilla) => {
        total++;
        if (persona.segundoNombre === "") sinSegundoNombre++;
        if ([persona.primerApellido, persona.segundoApellido, persona.primerNombre, persona.segundoNombre].some((x) => x.includes(N))) enie++;
        const campos = (["completa", "windows-truncada", "sin-pubdsk"] as const).map(
          (variante) => exito(parsearPdf417Amarilla(generarPdf417(persona, { variante, semilla }).bytes)).campos,
        );
        expect(campos[1]).toStrictEqual(campos[0]);
        expect(campos[2]).toStrictEqual(campos[0]);
      }),
      RUNS,
    );
    expect(sinSegundoNombre / total).toBeGreaterThanOrEqual(0.08);
    expect(enie / total).toBeGreaterThanOrEqual(0.2);
  });

  it("PA-19 Propiedad: warnings ordenada, sin duplicados y solo hipótesis no confirmadas (atrapa: IDs confirmados o del generador)", () => {
    const permitidos = ["H02", "H07", "H08", "H15"];
    fc.assert(
      fc.property(arbFixturePdf417(), (f) => {
        const w = exito(parsearPdf417Amarilla(f.bytes)).warnings;
        expect(w).toStrictEqual([...new Set(w)].sort());
        for (const id of w) {
          expect(id).toMatch(/^[A-Z][0-9]{2}$/);
          expect(permitidos).toContain(id);
        }
      }),
      RUNS,
    );
  });

  it("PA-04 Propiedad de tramas mutadas: 1 a 3 bytes sustituidos cumplen las invariantes por campo (atrapa: datos inventados con tramas corruptas)", () => {
    const sustitucion = fc.record({ posicion: fc.integer({ min: 0, max: 200 }), valor: fc.integer({ min: 0, max: 255 }) });
    let exitos = 0;
    let errores = 0;
    fc.assert(
      fc.property(arbFixturePdf417(), fc.array(sustitucion, { minLength: 1, maxLength: 3 }), (f, cambios) => {
        let trama = Uint8Array.from(f.bytes);
        for (const { posicion, valor } of cambios) trama = sustituir(trama, posicion, [valor]);
        const r = parsearPdf417Amarilla(trama);
        expect(problemasDeForma(r)).toStrictEqual([]);
        if (r.ok) exitos++;
        else errores++;
      }),
      RUNS,
    );
    expect(exitos / (exitos + errores)).toBeGreaterThan(0.5);
    expect(errores / (exitos + errores)).toBeGreaterThanOrEqual(0.05);
  });

  it("PA-21 El ayudante reproduce la Ñ del generador como 0xD1 (atrapa: codificar la Ñ en UTF-8)", () => {
    const f = generarPdf417({ ...PERSONA_BASE, primerApellido: "PE" + N + "A" }, { variante: "completa" });
    expect([...f.bytes.subarray(58, 62)]).toStrictEqual(latin1("PE" + N + "A"));
  });
});
