// fixture-sintetico: propiedades sobre payloads PDF417 de personas ficticias (prefijo 9999); PubDSK_1 es el marcador estructural.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbFixturePdf417, arbPersonaFicticia } from "../src/arbitrarios.js";
import { ErrorFixture } from "../src/errores.js";
import { generarPdf417 } from "../src/pdf417.js";
import { PERSONA_BASE, type PersonaFicticia } from "../src/persona.js";

const LATIN1 = new TextDecoder("latin1");
const texto = (bytes: Uint8Array, a: number, b: number): string => LATIN1.decode(bytes.subarray(a, b));
const NUL = String.fromCharCode(0);
const sinNulFinales = (s: string): string => s.replace(/\0+$/, "");
const CAMPOS_PERSONA = Object.keys(PERSONA_BASE);
const VARIANTES = ["completa", "windows-truncada", "sin-pubdsk", "fecha-primero"] as const;
const CODIGOS = [
  "persona-invalida",
  "nuip-fuera-de-rango-sintetico",
  "serial-fuera-de-rango-sintetico",
  "nombre-invalido",
  "nombre-demasiado-largo",
  "sexo-invalido",
  "fecha-invalida",
  "divipol-invalido",
  "rh-invalido",
  "variante-invalida",
  "semilla-invalida",
  "opcion-ocr-invalida",
  "nuip-no-soportado-en-mrz",
  "nombre-excede-mrz",
];
const PRIMEROS_NOMBRES = ["FICTICIA", "FICTICIO", "SINTETICA", "SINTETICO", "PRUEBA", "MUESTRA", "EJEMPLO"];
const APELLIDOS = ["PRUEBA", "EJEMPLO", "MUESTRA", "FICTICIO", "SINTETICO", "PEÑA", "NUÑEZ", "MUÑOZ", "MARTINEZ", "DE LA OSSA"];
const SEGUNDOS_NOMBRES = ["", "LUZ", "ANA", "JOSE", "MARIA", "DEL CARMEN"];
const NUM_RUNS = 1000;

const generar = (persona: unknown, opciones?: unknown) => generarPdf417(persona as PersonaFicticia, opciones as undefined);
const semillaArb = fc.integer({ min: 0, max: 0xffffffff });
const digitos = (min: number, max: number) => fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: min, maxLength: max });

/** Ejecuta `fn`; si lanza, exige `ErrorFixture` con un código de la lista y devuelve `undefined`. */
function intentar<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorFixture);
    expect(CODIGOS).toContain((e as ErrorFixture).codigo);
    return undefined;
  }
}

/** Como `intentar`, pero solo dice si generó. */
const generaOLanzaErrorFixture = (fn: () => unknown): boolean => intentar(() => {
    fn();
    return true;
  }) === true;

describe("FX-23 Arbitrarios válidos por construcción (PDF417)", { timeout: 60_000 }, () => {
  it("FX-23 Nombres claramente ficticios", () => {
    fc.assert(
      fc.property(arbPersonaFicticia({ nuipCorto: true }), (p) => {
        expect(PRIMEROS_NOMBRES).toContain(p.primerNombre);
        expect(APELLIDOS).toContain(p.primerApellido);
        expect(APELLIDOS).toContain(p.segundoApellido);
        expect(SEGUNDOS_NOMBRES).toContain(p.segundoNombre);
        expect(p.nuip).toMatch(/^9999[0-9]{1,6}$/);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-23 Personas sin nuipCorto: NUIP de 10 dígitos y serial sintético", () => {
    fc.assert(
      fc.property(arbPersonaFicticia(), (p) => {
        expect(p.nuip).toMatch(/^9999[0-9]{6}$/);
        expect(p.serialDocumento).toMatch(/^9999[0-9]{5}$/);
        expect(() => generarPdf417(p)).not.toThrow();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-23 arbFixturePdf417 sin nuipCorto da NUIP de 10 dígitos", () => {
    fc.assert(
      fc.property(arbFixturePdf417(), (f) => {
        expect(f.esperado.nuip).toMatch(/^9999[0-9]{6}$/);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-23 Filtro de variantes", () => {
    fc.assert(
      fc.property(arbFixturePdf417({ variantes: ["sin-pubdsk"] }), (f) => {
        expect(f.variante).toBe("sin-pubdsk");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-23 Variantes vacías o desconocidas rechazadas (PDF417)", () => {
    for (const variantes of [[], ["otra"], ["completa", "otra"], "completa", null]) {
      let error: unknown;
      try {
        arbFixturePdf417({ variantes: variantes as unknown as readonly "completa"[] });
      } catch (e) {
        error = e;
      }
      expect(error, JSON.stringify(variantes)).toBeInstanceOf(ErrorFixture);
      expect((error as ErrorFixture).codigo).toBe("variante-invalida");
      expect((error as ErrorFixture).campo).toBe("variantes");
    }
  });
});

describe("FX-24 Proporciones mínimas de los arbitrarios (PDF417)", { timeout: 60_000 }, () => {
  it("FX-24 Proporciones del PDF417", () => {
    const porVariante = new Map<string, number>();
    let rhNegativo = 0;
    let rhAb = 0;
    let sinSegundoNombre = 0;
    let conEnie = 0;
    let conEspacio = 0;
    let sexoFConM = 0;
    fc.assert(
      fc.property(arbFixturePdf417(), (f) => {
        const e = f.esperado;
        const nombres = [e.primerApellido, e.segundoApellido, e.primerNombre, e.segundoNombre];
        porVariante.set(f.variante, (porVariante.get(f.variante) ?? 0) + 1);
        if (e.rh.endsWith("-")) rhNegativo++;
        if (e.rh.startsWith("AB")) rhAb++;
        if (e.segundoNombre === "") sinSegundoNombre++;
        if (nombres.some((n) => n.includes("Ñ"))) conEnie++;
        if (nombres.some((n) => n.includes(" "))) conEspacio++;
        if (e.sexo === "F" && e.primerApellido.includes("M")) sexoFConM++;
      }),
      { numRuns: NUM_RUNS },
    );
    for (const v of VARIANTES) expect(porVariante.get(v) ?? 0, v).toBeGreaterThanOrEqual(0.15 * NUM_RUNS);
    expect(rhNegativo).toBeGreaterThanOrEqual(0.3 * NUM_RUNS);
    expect(rhAb).toBeGreaterThanOrEqual(0.15 * NUM_RUNS);
    expect(sinSegundoNombre).toBeGreaterThanOrEqual(0.08 * NUM_RUNS);
    expect(conEnie).toBeGreaterThanOrEqual(0.25 * NUM_RUNS);
    expect(conEspacio).toBeGreaterThanOrEqual(0.08 * NUM_RUNS);
    expect(sexoFConM).toBeGreaterThanOrEqual(0.08 * NUM_RUNS);
  });

  it("FX-24 Proporción de NUIP cortos", () => {
    let cortos = 0;
    fc.assert(
      fc.property(arbFixturePdf417({ nuipCorto: true }), (f) => {
        if (f.esperado.nuip.length < 10) cortos++;
      }),
      { numRuns: NUM_RUNS },
    );
    expect(cortos).toBeGreaterThanOrEqual(0.5 * NUM_RUNS);
  });
});

describe("FX-15 Estructura declarada del PDF417 (propiedad)", { timeout: 60_000 }, () => {
  const LONGITUD: Record<string, number> = { completa: 531, "windows-truncada": 520, "sin-pubdsk": 531, "fecha-primero": 531 };
  const INICIO_NUIP: Record<string, number> = { completa: 48, "windows-truncada": 37, "sin-pubdsk": 49, "fecha-primero": 48 };

  it("FX-15 Propiedad de estructura sobre todas las variantes", () => {
    fc.assert(
      fc.property(arbFixturePdf417({ nuipCorto: true }), (f) => {
        const { bytes, rangos: r, esperado: e } = f;
        expect(bytes.length).toBe(LONGITUD[f.variante]);
        expect(r.nuip[0]).toBe(INICIO_NUIP[f.variante]);
        const nombres = ["primerApellido", "segundoApellido", "primerNombre", "segundoNombre"] as const;
        for (const campo of nombres) {
          expect(r[campo][1] - r[campo][0]).toBe(23);
          expect(sinNulFinales(texto(bytes, ...r[campo]))).toBe(e[campo]);
        }
        expect(texto(bytes, ...r.nuip).replace(/^0+/, "")).toBe(e.nuip);
        expect(texto(bytes, ...r.rh)).toBe(e.rh);
        expect(texto(bytes, ...r.bloqueDemografico)).toContain(e.fechaNacimiento.replaceAll("-", ""));
        const contiguos = [r.nuip, r.primerApellido, r.segundoApellido, r.primerNombre, r.segundoNombre, r.bloqueDemografico, r.cola];
        for (let i = 1; i < contiguos.length; i++) expect(contiguos[i]?.[0]).toBe(contiguos[i - 1]?.[1]);
        expect(r.rh[1]).toBe(r.bloqueDemografico[1]);
        expect(r.cola[1]).toBe(bytes.length);
        expect(texto(bytes, ...r.afis)).toMatch(/^9999[0-9]{4}$/);
        if (r.marcador === null) expect(LATIN1.decode(bytes)).not.toContain("PubDSK");
        else expect(texto(bytes, ...r.marcador)).toBe("PubDSK_1");
        expect(r.marcador === null).toBe(f.variante === "sin-pubdsk");
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("FX-10, FX-11 y FX-12 Relaciones con la trama completa (propiedad)", { timeout: 60_000 }, () => {
  it("FX-10, FX-11 y FX-12 Relaciones exactas para toda persona y semilla", () => {
    fc.assert(
      fc.property(arbPersonaFicticia({ nuipCorto: true }), semillaArb, (p, semilla) => {
        const c = generarPdf417(p, { semilla });
        const w = generarPdf417(p, { variante: "windows-truncada", semilla });
        const s = generarPdf417(p, { variante: "sin-pubdsk", semilla });
        const f = generarPdf417(p, { variante: "fecha-primero", semilla });
        expect([...w.bytes]).toStrictEqual([...c.bytes.subarray(0, 13), ...c.bytes.subarray(24)]);
        expect([...s.bytes]).toStrictEqual([...c.bytes.subarray(0, 24), ...new Array<number>(9).fill(0), ...c.bytes.subarray(32, 530)]);
        expect([...f.bytes.subarray(0, 150)]).toStrictEqual([...c.bytes.subarray(0, 150)]);
        const fecha = p.fechaNacimiento.replaceAll("-", "");
        const bloque = texto(f.bytes, ...f.rangos.bloqueDemografico);
        expect(bloque.slice(0, 16)).toBe("02" + fecha + p.sexo + p.departamento + p.municipio);
        expect(bloque.slice(16, 17)).toMatch(/^[0-9]$/);
        expect(bloque.slice(17)).toBe(p.rh);
        expect(texto(c.bytes, ...c.rangos.bloqueDemografico).slice(0, 15)).toBe("0" + p.sexo + fecha + p.departamento + p.municipio);
        for (const otra of [w, s, f]) expect(otra.esperado).toStrictEqual(c.esperado);
        expect(f.bytes.length).toBe(531);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("FX-05 Nunca un número fuera del rango sintético (propiedad, generarPdf417)", { timeout: 60_000 }, () => {
  it("FX-05 Propiedad sobre números arbitrarios", () => {
    const nuipArb = fc.oneof(
      { arbitrary: digitos(1, 6).map((d) => "9999" + d), weight: 4 },
      { arbitrary: fc.stringMatching(/^[0-9]{1,12}$/), weight: 1 },
      { arbitrary: fc.string(), weight: 1 },
    );
    const serialArb = fc.oneof(
      { arbitrary: digitos(5, 5).map((d) => "9999" + d), weight: 4 },
      { arbitrary: fc.stringMatching(/^[0-9]{1,12}$/), weight: 1 },
      { arbitrary: fc.string(), weight: 1 },
    );
    let salidas = 0;
    let rechazos = 0;
    fc.assert(
      fc.property(nuipArb, serialArb, fc.constantFrom(...VARIANTES), semillaArb, (nuip, serialDocumento, variante, semilla) => {
        const f = intentar(() => generar({ ...PERSONA_BASE, nuip, serialDocumento }, { variante, semilla }));
        if (f !== undefined) {
          salidas++;
          const payload = LATIN1.decode(f.bytes);
          const m = /([0-9]{10})[A-ZÑ]/.exec(payload);
          expect(m?.[1]?.replace(/^0+/, "")).toMatch(/^9999[0-9]{1,6}$/);
          expect(texto(f.bytes, ...f.rangos.afis)).toMatch(/^9999[0-9]{4}$/);
        } else {
          rechazos++;
        }
      }),
      { numRuns: NUM_RUNS },
    );
    expect(salidas).toBeGreaterThanOrEqual(0.2 * NUM_RUNS);
    expect(rechazos).toBeGreaterThanOrEqual(0.2 * NUM_RUNS);
  });
});

describe("FX-03 Entradas arbitrarias solo producen ErrorFixture (generarPdf417)", { timeout: 60_000 }, () => {
  it("FX-03 Pares persona y opciones de fc.anything()", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (p, o) => {
        generaOLanzaErrorFixture(() => generar(p, o));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-03 Persona base con un campo arbitrario y opciones arbitrarias", () => {
    const opcionesArb = fc.oneof(
      fc.constant(undefined),
      fc.anything(),
      fc.record(
        { variante: fc.oneof(fc.constantFrom(...VARIANTES), fc.anything()), semilla: fc.oneof(semillaArb, fc.anything()) },
        { requiredKeys: [] },
      ),
    );
    let rechazos = 0;
    fc.assert(
      fc.property(fc.constantFrom(...CAMPOS_PERSONA), fc.anything(), opcionesArb, (campo, valor, o) => {
        if (!generaOLanzaErrorFixture(() => generar({ ...PERSONA_BASE, [campo]: valor }, o))) rechazos++;
      }),
      { numRuns: NUM_RUNS },
    );
    expect(rechazos).toBeGreaterThanOrEqual(0.5 * NUM_RUNS);
  });

  it("FX-03 Bytes arbitrarios como texto de un campo", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CAMPOS_PERSONA), fc.string({ unit: "binary" }), (campo, valor) => {
        generaOLanzaErrorFixture(() => generar({ ...PERSONA_BASE, [campo]: valor + NUL }));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("FX-06 Determinismo con semilla (arbitrarios PDF417)", { timeout: 60_000 }, () => {
  it("FX-06 Arbitrarios reproducibles", () => {
    const a = fc.sample(arbFixturePdf417(), { seed: 42, numRuns: 50 });
    const b = fc.sample(arbFixturePdf417(), { seed: 42, numRuns: 50 });
    expect(a).toStrictEqual(b);
    expect(new Set(a.map((f) => f.semilla)).size).toBeGreaterThan(1);
  });

  it("FX-06 Determinismo de generarPdf417 para toda persona, variante y semilla", () => {
    fc.assert(
      fc.property(arbPersonaFicticia({ nuipCorto: true }), fc.constantFrom(...VARIANTES), semillaArb, (p, variante, semilla) => {
        expect(generarPdf417(p, { variante, semilla })).toStrictEqual(generarPdf417(p, { variante, semilla }));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
