// Datos sintéticos: propiedades sobre MRZ TD1 de personas ficticias (NUIP y serial con prefijo 9999).
import fc from "fast-check";
import { parse } from "mrz";
import { describe, expect, it } from "vitest";
import { arbFixtureMrz, arbPersonaFicticia } from "../src/arbitrarios.js";
import { ErrorFixture } from "../src/errores.js";
import { generarMrzTd1 } from "../src/mrz.js";
import { generarPdf417 } from "../src/pdf417.js";
import { PERSONA_BASE, type PersonaFicticia } from "../src/persona.js";

const NUM_RUNS = 1000;
const VARIANTES = [
  "valida",
  "cd-documento-alterado",
  "cd-nacimiento-alterado",
  "cd-vencimiento-alterado",
  "cd-compuesto-alterado",
  "cd-documento-relleno",
  "ocr-b",
] as const;
const ALTERADAS = ["cd-documento-alterado", "cd-nacimiento-alterado", "cd-vencimiento-alterado", "cd-compuesto-alterado"] as const;
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
/** Tabla de confusiones OCR-B de FX-20 y zonas numéricas como intervalos semiabiertos (literales de la spec). */
const CONFUSIONES: Record<string, readonly string[]> = { "0": ["O", "Q"], "1": ["I"], "2": ["Z"], "5": ["S"], "6": ["G"], "8": ["B"] };
const ZONAS: readonly (readonly [number, number, number])[] = [
  [1, 5, 20],
  [2, 0, 7],
  [2, 8, 15],
  [2, 18, 28],
  [2, 29, 30],
];
const enZona = (linea: number, posicion: number): boolean => ZONAS.some(([l, a, b]) => l === linea && posicion >= a && posicion < b);

const generar = (persona: unknown, opciones?: unknown) => generarMrzTd1(persona as PersonaFicticia, opciones as undefined);
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

/** Estado de los cuatro dígitos de control según el paquete `mrz` 5.0.2 (oráculo diferencial, design.md decisión 11). */
function digitosSegunMrz(lineas: readonly string[]) {
  const detalles = parse([...lineas]).details;
  const valido = (campo: string): boolean => {
    const d = detalles.find((x) => x.field === campo);
    expect(d, campo).toBeDefined();
    return d?.valid === true;
  };
  return {
    documento: valido("documentNumberCheckDigit"),
    nacimiento: valido("birthDateCheckDigit"),
    vencimiento: valido("expirationDateCheckDigit"),
    compuesto: valido("compositeCheckDigit"),
  };
}

describe("FX-17 Dígitos de control ICAO 9303 (diferencial)", { timeout: 60_000 }, () => {
  it("FX-17 El diferencial reconoce la MRZ de la persona base", () => {
    expect(digitosSegunMrz(generarMrzTd1(PERSONA_BASE).lineas)).toStrictEqual({ documento: true, nacimiento: true, vencimiento: true, compuesto: true });
    expect(digitosSegunMrz(generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" }).lineas).compuesto).toBe(false);
  });

  it("FX-17 Oráculo diferencial", () => {
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["valida"] }), (f) => {
        expect(digitosSegunMrz(f.lineas)).toStrictEqual({ documento: true, nacimiento: true, vencimiento: true, compuesto: true });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("FX-19 Dígitos de control alterados (diferencial)", { timeout: 60_000 }, () => {
  it("FX-19 Exactamente un dígito inválido en toda persona", () => {
    const NOMBRE: Record<string, string> = {
      "cd-documento-alterado": "documento",
      "cd-nacimiento-alterado": "nacimiento",
      "cd-vencimiento-alterado": "vencimiento",
      "cd-compuesto-alterado": "compuesto",
    };
    const porVariante = new Map<string, number>();
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ALTERADAS }), (f) => {
        const estados = digitosSegunMrz(f.lineas);
        const invalidos = Object.entries(estados).filter(([, ok]) => !ok).map(([nombre]) => nombre);
        expect(invalidos).toStrictEqual([NOMBRE[f.variante]]);
        expect(f.esperado.digitosControl[NOMBRE[f.variante] as keyof typeof estados]).toBe("invalido");
        porVariante.set(f.variante, (porVariante.get(f.variante) ?? 0) + 1);
      }),
      { numRuns: NUM_RUNS },
    );
    for (const v of ALTERADAS) expect(porVariante.get(v) ?? 0, v).toBeGreaterThanOrEqual(0.15 * NUM_RUNS);
  });
});

describe("FX-20 Errores OCR-B inyectados (propiedad)", { timeout: 60_000 }, () => {
  it("FX-20 Propiedad de reversibilidad", () => {
    let conCinco = 0;
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["ocr-b"] }), (f) => {
        expect(f.inyecciones.length).toBeGreaterThanOrEqual(1);
        expect(f.inyecciones.length).toBeLessThanOrEqual(5);
        if (f.inyecciones.length === 5) conCinco++;
        expect(new Set(f.inyecciones.map((i) => `${i.linea}:${i.posicion}`)).size).toBe(f.inyecciones.length);
        const deshechas = [...f.lineas];
        const tocadas = new Set<string>();
        for (const { linea, posicion, original, inyectado } of f.inyecciones) {
          expect(enZona(linea, posicion)).toBe(true);
          expect(CONFUSIONES[original]).toContain(inyectado);
          const actual = deshechas[linea - 1] ?? "";
          expect(actual[posicion]).toBe(inyectado);
          deshechas[linea - 1] = actual.slice(0, posicion) + original + actual.slice(posicion + 1);
          tocadas.add(`${linea}:${posicion}`);
        }
        expect(deshechas).toStrictEqual([...f.lineasSinErrores]);
        for (let l = 0; l < 3; l++) {
          for (let p = 0; p < 30; p++) {
            if (!tocadas.has(`${l + 1}:${p}`)) expect(f.lineas[l]?.[p]).toBe(f.lineasSinErrores[l]?.[p]);
          }
        }
        expect(f.lineas[2]).toBe(f.lineasSinErrores[2]);
        expect(digitosSegunMrz(f.lineasSinErrores)).toStrictEqual({ documento: true, nacimiento: true, vencimiento: true, compuesto: true });
      }),
      { numRuns: NUM_RUNS },
    );
    expect(conCinco).toBeGreaterThanOrEqual(0.1 * NUM_RUNS);
  });
});

describe("FX-23 Arbitrarios válidos por construcción (MRZ)", { timeout: 60_000 }, () => {
  it("FX-23 Personas siempre aceptadas", () => {
    let mrzGeneradas = 0;
    fc.assert(
      fc.property(arbPersonaFicticia(), (p) => {
        expect(() => generarPdf417(p)).not.toThrow();
        try {
          generarMrzTd1(p);
          mrzGeneradas++;
        } catch (e) {
          expect(e).toBeInstanceOf(ErrorFixture);
          expect((e as ErrorFixture).codigo).toBe("nombre-excede-mrz");
        }
      }),
      { numRuns: NUM_RUNS },
    );
    expect(mrzGeneradas).toBeGreaterThanOrEqual(0.5 * NUM_RUNS);
  });

  it("FX-23 Fixtures MRZ siempre generables", () => {
    let llenas = 0;
    fc.assert(
      fc.property(arbFixtureMrz(), (f) => {
        expect(f.esperado.nuip).toMatch(/^9999[0-9]{6}$/);
        expect(f.lineas[2]).toHaveLength(30);
        if (!f.lineas[2].endsWith("<")) llenas++;
        for (const linea of f.lineasSinErrores) expect(linea).toMatch(/^[A-Z0-9<]{30}$/);
      }),
      { numRuns: NUM_RUNS },
    );
    // El presupuesto admite exactamente 30 caracteres (FX-18): algunas líneas 3 lo agotan sin relleno.
    expect(llenas).toBeGreaterThanOrEqual(0.01 * NUM_RUNS);
  });

  it("FX-23 Filtro de variantes (MRZ)", () => {
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["cd-documento-relleno"] }), (f) => {
        expect(f.variante).toBe("cd-documento-relleno");
        expect(f.lineas[0][14]).toBe("<");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-23 Variantes vacías o desconocidas rechazadas (MRZ)", () => {
    for (const variantes of [[], ["otra"], ["completa"], ["valida", "otra"], "valida", null]) {
      let error: unknown;
      try {
        arbFixtureMrz({ variantes: variantes as unknown as readonly "valida"[] });
      } catch (e) {
        error = e;
      }
      expect(error, JSON.stringify(variantes)).toBeInstanceOf(ErrorFixture);
      expect((error as ErrorFixture).codigo).toBe("variante-invalida");
      expect((error as ErrorFixture).campo).toBe("variantes");
    }
  });
});

describe("FX-24 Proporciones mínimas de los arbitrarios (MRZ)", { timeout: 60_000 }, () => {
  it("FX-24 Proporciones de la MRZ", () => {
    const porVariante = new Map<string, number>();
    let conSegundoNombre = 0;
    let conEnie = 0;
    let conEspacio = 0;
    fc.assert(
      fc.property(arbFixtureMrz(), (f) => {
        const p = f.persona;
        porVariante.set(f.variante, (porVariante.get(f.variante) ?? 0) + 1);
        if (p.segundoNombre !== "") conSegundoNombre++;
        if (p.primerApellido.includes("Ñ") || p.segundoApellido.includes("Ñ")) conEnie++;
        if (p.primerApellido.includes(" ")) conEspacio++;
      }),
      { numRuns: NUM_RUNS },
    );
    for (const v of VARIANTES) expect(porVariante.get(v) ?? 0, v).toBeGreaterThanOrEqual(0.08 * NUM_RUNS);
    expect(conSegundoNombre).toBeGreaterThanOrEqual(0.2 * NUM_RUNS);
    expect(conEnie).toBeGreaterThanOrEqual(0.15 * NUM_RUNS);
    expect(conEspacio).toBeGreaterThanOrEqual(0.05 * NUM_RUNS);
  });
});

describe("FX-05 Nunca un número fuera del rango sintético (propiedad, generarMrzTd1)", { timeout: 60_000 }, () => {
  it("FX-05 Propiedad sobre números arbitrarios", () => {
    const nuipArb = fc.oneof(
      { arbitrary: digitos(6, 6).map((d) => "9999" + d), weight: 4 },
      { arbitrary: digitos(1, 6).map((d) => "9999" + d), weight: 1 },
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
        if (f === undefined) {
          rechazos++;
          return;
        }
        salidas++;
        expect(f.lineasSinErrores[1].slice(18, 28)).toMatch(/^9999[0-9]{6}$/);
        expect(f.lineasSinErrores[0].slice(5, 14)).toMatch(/^9999[0-9]{5}$/);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(salidas).toBeGreaterThanOrEqual(0.2 * NUM_RUNS);
    expect(rechazos).toBeGreaterThanOrEqual(0.2 * NUM_RUNS);
  });
});

describe("FX-03 Entradas arbitrarias solo producen ErrorFixture (generarMrzTd1)", { timeout: 60_000 }, () => {
  it("FX-03 Pares persona y opciones de fc.anything()", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (p, o) => {
        intentar(() => generar(p, o));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("FX-03 Persona base con un campo arbitrario y opciones arbitrarias", () => {
    const posicionArb = fc.oneof(
      fc.record({ linea: fc.constantFrom(1, 2), posicion: fc.integer({ min: -1, max: 30 }) }),
      fc.record({ linea: fc.anything(), posicion: fc.anything(), caracter: fc.anything() }, { requiredKeys: [] }),
      fc.anything(),
    );
    const opcionesArb = fc.oneof(
      fc.constant(undefined),
      fc.anything(),
      fc.record(
        {
          variante: fc.oneof(fc.constantFrom(...VARIANTES), fc.anything()),
          semilla: fc.oneof(semillaArb, fc.anything()),
          erroresOcr: fc.oneof(fc.integer({ min: -1, max: 7 }), fc.anything()),
          posicionesOcr: fc.oneof(fc.array(posicionArb, { maxLength: 4 }), fc.anything()),
        },
        { requiredKeys: [] },
      ),
    );
    let rechazos = 0;
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(PERSONA_BASE)), fc.anything(), opcionesArb, (campo, valor, o) => {
        if (intentar(() => generar({ ...PERSONA_BASE, [campo]: valor }, o)) === undefined) rechazos++;
      }),
      { numRuns: NUM_RUNS },
    );
    expect(rechazos).toBeGreaterThanOrEqual(0.5 * NUM_RUNS);
  });

  it("FX-03 Opciones OCR arbitrarias sobre la persona base", () => {
    let generadas = 0;
    let rechazadas = 0;
    fc.assert(
      fc.property(
        fc.array(fc.record({ linea: fc.constantFrom(1, 2), posicion: fc.integer({ min: 0, max: 29 }), caracter: fc.oneof({ arbitrary: fc.constant(undefined), weight: 3 }, { arbitrary: fc.constantFrom("O", "Q", "I", "Z", "S", "G", "B", "X"), weight: 1 }) }), { minLength: 1, maxLength: 3 }),
        (posicionesOcr) => {
          if (intentar(() => generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr })) === undefined) rechazadas++;
          else generadas++;
        },
      ),
      { numRuns: NUM_RUNS },
    );
    expect(generadas).toBeGreaterThanOrEqual(0.05 * NUM_RUNS);
    expect(rechazadas).toBeGreaterThanOrEqual(0.2 * NUM_RUNS);
  });
});

describe("FX-06 Determinismo con semilla (arbitrarios MRZ)", { timeout: 60_000 }, () => {
  it("FX-06 Arbitrarios reproducibles", () => {
    const a = fc.sample(arbFixtureMrz(), { seed: 42, numRuns: 50 });
    const b = fc.sample(arbFixtureMrz(), { seed: 42, numRuns: 50 });
    expect(a).toStrictEqual(b);
    expect(new Set(a.map((f) => f.texto)).size).toBeGreaterThan(1);
  });

  it("FX-06 Determinismo de generarMrzTd1 para toda persona, variante y semilla", () => {
    fc.assert(
      fc.property(arbFixtureMrz(), (f) => {
        const o = f.variante === "ocr-b" ? { variante: f.variante, semilla: f.semilla, erroresOcr: f.inyecciones.length } : { variante: f.variante, semilla: f.semilla };
        expect(generarMrzTd1(f.persona, o)).toStrictEqual(f);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
