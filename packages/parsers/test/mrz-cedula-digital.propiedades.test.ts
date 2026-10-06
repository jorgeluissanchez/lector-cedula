// fixture-sintetico: todas las MRZ salen de @lector-cedula/fixtures (personas ficticias, NUIP y serial 9999...).
// Contrato: openspec/changes/parser-mrz-cedula-digital/specs/mrz-cedula-digital/spec.md (MZ-02, MZ-07, MZ-09, MZ-21);
// traducción de `esperado` y medidas de vacuidad: design.md, decisión 11 y sección Pruebas.
// El oráculo diferencial es `parse` de `mrz` 5.0.2 (otro autor, otro código; decisión 1).
import {
  arbFixtureMrz,
  arbPersonaFicticia,
  ErrorFixture,
  type FixtureMrz,
  generarMrzTd1,
  PERSONA_BASE,
  type PersonaFicticia,
  VERSION_CONTRATO,
} from "@lector-cedula/fixtures";
import fc from "fast-check";
import { parse as parseMrz } from "mrz";
import { describe, expect, it } from "vitest";
import { parsearMrzCedulaDigital } from "../src/index.js";
import type { CamposMrzCedulaDigital, ResultadoMrzCedulaDigital } from "../src/index.js";
import { cumpleFormaMz01 } from "./ayudas/forma-mrz.js";

const REF = { fechaReferencia: "2026-10-06" };
const RUNS = 1000;

type Aceptado = Extract<ResultadoMrzCedulaDigital, { ok: true }>;
type ClaveDigito = keyof Aceptado["digitosControl"];

function parsear(lineas: readonly string[]): ResultadoMrzCedulaDigital {
  return parsearMrzCedulaDigital([...lineas], REF);
}

/** Resultado aceptado o fallo explícito (las propiedades de esta sección parten de MRZ legibles). */
function aceptado(lineas: readonly string[]): Aceptado {
  const r = parsear(lineas);
  if (!r.ok) throw new Error(`rechazo inesperado: ${JSON.stringify(r)} para ${JSON.stringify(lineas)}`);
  return r;
}

/** Traducción de `esperado` del generador a `campos` del parser (design.md, decisión 11; evidencia M02 y M03). */
function traducirCampos(f: FixtureMrz): CamposMrzCedulaDigital {
  const e = f.esperado;
  return {
    serial: e.serialDocumento,
    // Nombre neutral (M03 pendiente): las 5 cifras crudas, sin afirmar expedición ni nacimiento.
    codigoLugarMrz: e.lugarExpedicion,
    fechaNacimiento: e.fechaNacimiento,
    sexo: e.sexo,
    fechaVencimiento: e.fechaVencimiento,
    nacionalidad: e.nacionalidad,
    // M02 confirmada con corrección: 10 cifras seguidas de "<" en el opcional de 11; el generador solo admite 10.
    nuip: e.nuip,
    nuipTipoProbable: "nuip",
    apellidos: `${e.primerApellido} ${e.segundoApellido}`,
    nombres: e.segundoNombre === "" ? e.primerNombre : `${e.primerNombre} ${e.segundoNombre}`,
    nombresPosiblementeTruncados: f.lineas[2].charAt(29) !== "<",
  };
}

/** Estados de `esperado.digitosControl` traducidos: `documento` es `serial` y `relleno` es `ausente`. */
function traducirEstados(f: FixtureMrz): Record<ClaveDigito, string> {
  const d = f.esperado.digitosControl;
  const t = (e: string) => (e === "relleno" ? "ausente" : e);
  return { serial: t(d.documento), nacimiento: t(d.nacimiento), vencimiento: t(d.vencimiento), compuesto: t(d.compuesto) };
}

function estados(r: Aceptado): Record<ClaveDigito, string> {
  const d = r.digitosControl;
  return { serial: d.serial.estado, nacimiento: d.nacimiento.estado, vencimiento: d.vencimiento.estado, compuesto: d.compuesto.estado };
}

/** Fechas que la regla de siglo puede representar con REF (decisión 11). */
const NACIMIENTO_MIN = "1926-10-07";
const NACIMIENTO_MAX = "2026-10-06";
const VENCIMIENTO_MIN = "2000-01-01";
const VENCIMIENTO_MAX = "2099-12-31";
const enRango = (fecha: string, min: string, max: string) => fecha >= min && fecha <= max;

function arbFechaIso(min: string, max: string): fc.Arbitrary<string> {
  return fc
    .date({ min: new Date(`${min}T00:00:00.000Z`), max: new Date(`${max}T00:00:00.000Z`), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10));
}

/** Persona ficticia con fechas sustituidas por los rangos representables (válida por construcción). */
const arbPersonaRepresentable: fc.Arbitrary<PersonaFicticia> = fc
  .tuple(arbPersonaFicticia(), arbFechaIso(NACIMIENTO_MIN, NACIMIENTO_MAX), arbFechaIso(VENCIMIENTO_MIN, VENCIMIENTO_MAX))
  .map(([p, fechaNacimiento, fechaVencimiento]) => ({ ...p, fechaNacimiento, fechaVencimiento }));

/** Fixtures válidos del generador (MZ-21: variante `"valida"`, fechas dentro de los rangos por construcción). */
const arbValida = arbFixtureMrz({ variantes: ["valida"] });

/** Zonas numéricas de MZ-07 (línea 1 col. 15-19 según MZ-11, que el generador siempre llena con 5 cifras). */
const ZONAS_NUMERICAS: readonly (readonly [linea: 1 | 2, desde: number, hasta: number])[] = [
  [1, 5, 14],
  [1, 15, 19],
  [2, 0, 6],
  [2, 8, 14],
  [2, 18, 29],
];
/** Confusiones OCR-B de MZ-07 (de la spec, inversa de la tabla de corrección). */
const CONFUSIONES: Readonly<Record<string, readonly string[]>> = {
  "0": ["O", "Q"],
  "1": ["I"],
  "2": ["Z"],
  "5": ["S"],
  "6": ["G"],
  "8": ["B"],
};

const reemplazar = (s: string, i: number, c: string) => s.slice(0, i) + c + s.slice(i + 1);

function comoMutables(lineas: readonly string[]): [string, string, string] {
  return [lineas[0] as string, lineas[1] as string, lineas[2] as string];
}

describe("MZ-21 contrato del generador", () => {
  it("MZ-21 VERSION_CONTRATO es 1.x (FX-02)", () => {
    expect(VERSION_CONTRATO).toMatch(/^1\.[0-9]+\.[0-9]+$/);
  });

  it("MZ-21 Persona base del generador", () => {
    const lineas = generarMrzTd1(PERSONA_BASE).lineas;
    expect(lineas).toStrictEqual(["ICCOL999912345516001<<<<<<<<<<", "8503149F3503144COL9999123456<5", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<"]);
    const r = aceptado(lineas);
    expect(r.campos).toStrictEqual({
      serial: "999912345",
      codigoLugarMrz: "16001",
      fechaNacimiento: "1985-03-14",
      sexo: "F",
      fechaVencimiento: "2035-03-14",
      nacionalidad: "COL",
      nuip: "9999123456",
      nuipTipoProbable: "nuip",
      apellidos: "PRUEBA EJEMPLO",
      nombres: "FICTICIA LUZ",
      nombresPosiblementeTruncados: false,
    });
    expect(r.valido).toBe(true);
  });
});

// Propiedades con numRuns >= 1000: margen para la instrumentación de cobertura y Stryker con agentes en paralelo.
describe("MZ-21 ida y vuelta con el generador", { timeout: 120_000 }, () => {
  it("MZ-21 Propiedad de ida y vuelta y cobertura medida de sus categorías", () => {
    let intentos = 0;
    let descartes = 0;
    const categorias = { sexoM: 0, sexoF: 0, nacimiento19: 0, nacimiento20: 0, segundoNombreVacio: 0, apellidos3: 0 };
    fc.assert(
      fc.property(arbPersonaRepresentable, (persona) => {
        intentos++;
        let f: FixtureMrz;
        try {
          f = generarMrzTd1(persona, { variante: "valida" });
        } catch (error) {
          // Solo se descarta la línea 3 que no cabe (decisión 11); cualquier otro error es un fallo.
          if (error instanceof ErrorFixture && error.codigo === "nombre-excede-mrz") {
            descartes++;
            return;
          }
          throw error;
        }
        const r = aceptado(f.lineas);
        expect(r.valido).toBe(true);
        expect(r.correcciones).toStrictEqual([]);
        expect(r.errores).toStrictEqual([]);
        expect(r.campos).toStrictEqual(traducirCampos(f));
        expect(r.warnings).toStrictEqual(["M03"]);
        if (f.esperado.sexo === "M") categorias.sexoM++;
        else categorias.sexoF++;
        if (f.esperado.fechaNacimiento < "2000") categorias.nacimiento19++;
        else categorias.nacimiento20++;
        if (f.esperado.segundoNombre === "") categorias.segundoNombreVacio++;
        if (r.campos.apellidos.split(" ").length >= 3) categorias.apellidos3++;
      }),
      { numRuns: RUNS },
    );
    const utiles = intentos - descartes;
    expect(intentos).toBeGreaterThanOrEqual(RUNS);
    expect(descartes / intentos).toBeLessThan(0.5);
    for (const [categoria, n] of Object.entries(categorias)) {
      expect(n / utiles, categoria).toBeGreaterThanOrEqual(0.05);
    }
  });

  it("MZ-21 Variantes del generador con dígitos alterados o de relleno", () => {
    const variantes = ["cd-documento-alterado", "cd-nacimiento-alterado", "cd-vencimiento-alterado", "cd-compuesto-alterado", "cd-documento-relleno"] as const;
    const conteo: Record<string, number> = {};
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: [...variantes] }), (f) => {
        // Rangos por construcción del arbitrario; se comprueban, no se filtran.
        expect(enRango(f.esperado.fechaNacimiento, NACIMIENTO_MIN, NACIMIENTO_MAX)).toBe(true);
        expect(enRango(f.esperado.fechaVencimiento, VENCIMIENTO_MIN, VENCIMIENTO_MAX)).toBe(true);
        conteo[f.variante] = (conteo[f.variante] ?? 0) + 1;
        const r = aceptado(f.lineas);
        expect(estados(r)).toStrictEqual(traducirEstados(f));
        expect(r.valido).toBe(f.variante === "cd-documento-relleno");
      }),
      { numRuns: RUNS },
    );
    for (const v of variantes) expect((conteo[v] ?? 0) / RUNS, v).toBeGreaterThanOrEqual(0.15);
  });

  it("MZ-21 Variante OCR-B del generador", () => {
    let conInyecciones = 0;
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["ocr-b"] }), (f) => {
        expect(enRango(f.esperado.fechaNacimiento, NACIMIENTO_MIN, NACIMIENTO_MAX)).toBe(true);
        expect(enRango(f.esperado.fechaVencimiento, VENCIMIENTO_MIN, VENCIMIENTO_MAX)).toBe(true);
        if (f.inyecciones.length > 0) conInyecciones++;
        const r = aceptado(f.lineas);
        const limpio = aceptado(f.lineasSinErrores);
        expect(r.campos).toStrictEqual(limpio.campos);
        expect(r.digitosControl).toStrictEqual(limpio.digitosControl);
        expect(r.valido).toBe(limpio.valido);
        expect(r.lineasCorregidas).toStrictEqual(comoMutables(f.lineasSinErrores));
        const esperadas = [...f.inyecciones]
          .sort((a, b) => a.linea - b.linea || a.posicion - b.posicion)
          .map((i) => ({ linea: i.linea, columna: i.posicion, original: i.inyectado, corregido: i.original }));
        expect(r.correcciones).toStrictEqual(esperadas);
      }),
      { numRuns: RUNS },
    );
    // La variante debe inyectar algo: si no, la propiedad se reduce a la ida y vuelta.
    expect(conInyecciones / RUNS).toBeGreaterThanOrEqual(0.15);
  });
});

/** Posiciones de las zonas numéricas con un dígito confundible en las líneas dadas. */
function elegiblesOcr(lineas: readonly string[]): { linea: 1 | 2; columna: number; digito: string }[] {
  const salida: { linea: 1 | 2; columna: number; digito: string }[] = [];
  for (const [linea, desde, hasta] of ZONAS_NUMERICAS) {
    for (let columna = desde; columna <= hasta; columna++) {
      const digito = (lineas[linea - 1] as string).charAt(columna);
      if (CONFUSIONES[digito] !== undefined) salida.push({ linea, columna, digito });
    }
  }
  return salida;
}

/** MRZ válida del generador con un subconjunto no vacío de sus dígitos confundibles sustituido (MZ-07). */
const arbInyeccionOcr = arbValida.chain((f) =>
  fc
    .subarray(elegiblesOcr(f.lineas), { minLength: 1 })
    .chain((posiciones) =>
      fc.tuple(...posiciones.map((p) => fc.constantFrom(...(CONFUSIONES[p.digito] as string[])).map((letra) => ({ ...p, letra })))),
    )
    .map((sustituciones) => ({ f, sustituciones })),
);

describe("MZ-07 propiedad de inyección OCR-B", { timeout: 120_000 }, () => {
  it("MZ-07 Propiedad de inyección de confusiones OCR-B", () => {
    let dosOMas = 0;
    fc.assert(
      fc.property(arbInyeccionOcr, ({ f, sustituciones }) => {
        if (sustituciones.length >= 2) dosOMas++;
        const lineas = comoMutables(f.lineas);
        for (const s of sustituciones) lineas[s.linea - 1] = reemplazar(lineas[s.linea - 1] as string, s.columna, s.letra);
        const limpio = aceptado(f.lineas);
        const r = aceptado(lineas);
        expect(r.campos).toStrictEqual(limpio.campos);
        expect(r.digitosControl).toStrictEqual(limpio.digitosControl);
        expect(r.valido).toBe(limpio.valido);
        expect(r.lineasCorregidas).toStrictEqual(limpio.lineasCorregidas);
        // `fc.subarray` conserva el orden de `elegiblesOcr`, que ya es por línea y columna.
        expect(r.correcciones).toStrictEqual(sustituciones.map((s) => ({ linea: s.linea, columna: s.columna, original: s.letra, corregido: s.digito })));
      }),
      { numRuns: RUNS },
    );
    expect(dosOMas / RUNS).toBeGreaterThanOrEqual(0.3);
  });
});

/** Posición (línea desde 0, columna) de cada dígito de control (MZ-09). */
const POSICION_DIGITO: Readonly<Record<ClaveDigito, readonly [0 | 1, number]>> = {
  serial: [0, 14],
  nacimiento: [1, 6],
  vencimiento: [1, 14],
  compuesto: [1, 29],
};

/** Zonas de datos cubiertas por algún dígito de control (MZ-09): línea desde 0, columnas incluidas. */
const ZONAS_DATOS: Readonly<Record<string, readonly [0 | 1, number, number]>> = {
  serial: [0, 5, 13],
  opcionalL1: [0, 15, 19],
  nacimiento: [1, 0, 5],
  vencimiento: [1, 8, 13],
  opcionalL2: [1, 18, 28],
};

describe("MZ-09 propiedades de los dígitos de control", { timeout: 120_000 }, () => {
  for (const clave of Object.keys(POSICION_DIGITO) as ClaveDigito[]) {
    it(`MZ-09 Propiedad de alteración de cada dígito de control (${clave})`, () => {
      const [linea, columna] = POSICION_DIGITO[clave];
      fc.assert(
        fc.property(arbValida, fc.integer({ min: 1, max: 9 }), (f, desplazamiento) => {
          const lineas = comoMutables(f.lineas);
          const otra = String((Number(lineas[linea]?.charAt(columna)) + desplazamiento) % 10);
          lineas[linea] = reemplazar(lineas[linea] as string, columna, otra);
          const r = aceptado(lineas);
          const esperado: Record<ClaveDigito, string> = { serial: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "invalido" };
          esperado[clave] = "invalido";
          expect(estados(r)).toStrictEqual(esperado);
          expect(r.valido).toBe(false);
        }),
        { numRuns: RUNS },
      );
    });
  }

  it("MZ-09 Propiedad de sustitución de una cifra de datos", () => {
    const elegidas: Record<string, number> = {};
    let sustituidas = 0;
    const zonas = Object.keys(ZONAS_DATOS);
    fc.assert(
      fc.property(arbValida, fc.constantFrom(...zonas), fc.nat(), fc.integer({ min: 1, max: 9 }), (f, zona, indice, desplazamiento) => {
        const [linea, desde, hasta] = ZONAS_DATOS[zona] as readonly [0 | 1, number, number];
        const lineas = comoMutables(f.lineas);
        // Solo columnas con cifra (el opcional de la línea 2 termina en relleno); válido por construcción.
        const columnas: number[] = [];
        for (let c = desde; c <= hasta; c++) if (/[0-9]/.test(lineas[linea]?.charAt(c) ?? "")) columnas.push(c);
        const columna = columnas[indice % columnas.length] as number;
        const otra = String((Number(lineas[linea]?.charAt(columna)) + desplazamiento) % 10);
        lineas[linea] = reemplazar(lineas[linea] as string, columna, otra);
        elegidas[zona] = (elegidas[zona] ?? 0) + 1;
        sustituidas++;
        const r = parsear(lineas);
        expect(r.ok && r.valido).toBe(false);
      }),
      { numRuns: RUNS },
    );
    expect(sustituidas).toBe(RUNS);
    for (const zona of zonas) expect((elegidas[zona] ?? 0) / RUNS, zona).toBeGreaterThanOrEqual(0.1);
  });
});

/** Alfabeto del fuzz de MZ-02. */
const ALFABETO_FUZZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< ";

/** MRZ válida del generador con `min` a 5 posiciones al azar sustituidas por caracteres del alfabeto del fuzz. */
function arbFuzz(min: number) {
  return fc
    .tuple(
      arbValida,
      fc.array(fc.tuple(fc.integer({ min: 0, max: 89 }), fc.constantFrom(...ALFABETO_FUZZ)), { minLength: min, maxLength: 5 }),
    )
    .map(([f, sustituciones]) => {
      const lineas = comoMutables(f.lineas);
      for (const [p, c] of sustituciones) {
        const linea = Math.floor(p / 30);
        lineas[linea] = reemplazar(lineas[linea] as string, p % 30, c);
      }
      return lineas;
    });
}

describe("MZ-02 fuzz sobre MRZ válidas", { timeout: 180_000 }, () => {
  it("MZ-02 Fuzz sobre MRZ válidas", () => {
    const FUZZ_RUNS = 5000;
    let aceptados = 0;
    fc.assert(
      fc.property(arbFuzz(1), (lineas) => {
        const r = parsear(lineas);
        expect(cumpleFormaMz01(r)).toBe(true);
        if (r.ok) aceptados++;
      }),
      { numRuns: FUZZ_RUNS },
    );
    expect(aceptados / FUZZ_RUNS).toBeGreaterThan(0.5);
  });
});

/** Campo de `mrz` que corresponde a cada dígito de control (MZ-09). */
const CAMPO_MRZ: Readonly<Record<ClaveDigito, string>> = {
  serial: "documentNumberCheckDigit",
  nacimiento: "birthDateCheckDigit",
  vencimiento: "expirationDateCheckDigit",
  compuesto: "compositeCheckDigit",
};

describe("MZ-09 oráculo diferencial con mrz 5.0.2", { timeout: 180_000 }, () => {
  it("MZ-09 Oráculo diferencial con la librería mrz", () => {
    const DIFERENCIAL_RUNS = 2000;
    let comparados = 0;
    let conDigitoInvalido = 0;
    fc.assert(
      fc.property(arbFuzz(0), (lineas) => {
        const r = parsear(lineas);
        if (!r.ok || !/[0-9]/.test(r.lineasCorregidas[0].charAt(14))) return;
        comparados++;
        const detalles = parseMrz(r.lineasCorregidas).details;
        const claves = Object.keys(CAMPO_MRZ) as ClaveDigito[];
        if (claves.some((c) => r.digitosControl[c].estado !== "valido")) conDigitoInvalido++;
        for (const clave of claves) {
          const detalle = detalles.find((d) => d.field === CAMPO_MRZ[clave]);
          expect(detalle, CAMPO_MRZ[clave]).toBeDefined();
          expect(r.digitosControl[clave].estado === "valido", `${clave} en ${JSON.stringify(r.lineasCorregidas)}`).toBe(detalle?.valid);
        }
      }),
      { numRuns: DIFERENCIAL_RUNS },
    );
    expect(comparados).toBeGreaterThanOrEqual(1000);
    expect(comparados / DIFERENCIAL_RUNS).toBeGreaterThan(0.5);
    expect(conDigitoInvalido / comparados).toBeGreaterThanOrEqual(0.3);
  });
});
