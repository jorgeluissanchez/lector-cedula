// fixture-sintetico: todos los números son sintéticos (empiezan por 9999 tras normalizar o son solo ceros).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validarFormatoNuip } from "../src/index.js";
import type { ResultadoFormatoNuip } from "../src/index.js";

const MOTIVOS = [
  "entrada-no-texto",
  "tipo-documento-invalido",
  "entrada-demasiado-larga",
  "caracteres-invalidos",
  "posible-digito-verificacion",
  "vacio",
  "longitud-invalida",
];
const TIPOS = ["nuip", "cedula-antigua", "ti-antigua"];

/** Comprueba la forma exacta exigida por NF-01. */
function cumpleFormaNf01(r: ResultadoFormatoNuip): boolean {
  const claves = Object.keys(r).sort();
  if (r.valido) {
    return (
      JSON.stringify(claves) === JSON.stringify(["digitos", "numero", "tipoProbable", "valido", "warnings"]) &&
      typeof r.numero === "string" &&
      /^[1-9][0-9]*$/.test(r.numero) &&
      r.digitos === r.numero.length &&
      TIPOS.includes(r.tipoProbable) &&
      Array.isArray(r.warnings) &&
      r.warnings.every((w) => typeof w === "string")
    );
  }
  return JSON.stringify(claves) === JSON.stringify(["motivo", "valido"]) && MOTIVOS.includes(r.motivo);
}

const NBSP = "\u00A0";

const NO_TEXTO = { valido: false, motivo: "entrada-no-texto" };
const TIPO_INVALIDO = { valido: false, motivo: "tipo-documento-invalido" };
const DEMASIADO_LARGA = { valido: false, motivo: "entrada-demasiado-larga" };
const NIT = { valido: false, motivo: "posible-digito-verificacion" };
const NUIP_VALIDO = { valido: true, numero: "9999123456", tipoProbable: "nuip", digitos: 10, warnings: [] };
const TI_ANTIGUA = { valido: true, numero: "99991234567", tipoProbable: "ti-antigua", digitos: 11, warnings: ["N01"] };

/** Guiones admitidos por NF-03 (H en design.md, decisión 2). */
const GUIONES_ADMITIDOS = ["-", "\u2010", "\u2011", "\u2013", "\u2212"];
/** Espacio en blanco admitido por NF-03 (W en design.md, decisión 2). */
const BLANCOS_ADMITIDOS = [" ", "\t", "\n", "\r", "\u00A0", "\u202F"];
/** Todos los separadores admitidos por NF-03 (S = punto, H y W). */
const SEPARADORES_ADMITIDOS = [".", ...GUIONES_ADMITIDOS, ...BLANCOS_ADMITIDOS];
const DIGITOS_ASCII = "0123456789".split("");

/** Cadenas de dígitos ASCII y separadores de NF-03 de hasta `maxLength` caracteres (propiedad P1). */
const digitosYSeparadores = (maxLength: number) =>
  fc
    .array(fc.constantFrom(...DIGITOS_ASCII, ...SEPARADORES_ADMITIDOS), { maxLength })
    .map((partes) => partes.join(""));

/** Un carácter (un code point, o un surrogate aislado) que no es dígito ASCII ni separador de NF-03. */
const caracterNoAdmitido = fc
  .string({ unit: "binary", minLength: 1, maxLength: 1 })
  .filter((c) => !DIGITOS_ASCII.includes(c) && !SEPARADORES_ADMITIDOS.includes(c));

/*
 * Generadores válidos por construcción (design.md de pruebas-nuip-y-evals-robustas, decisión 1).
 */

/** Una racha de 0 a `max` caracteres tomados de `alfabeto`. */
const racha = (alfabeto: readonly string[], max: number) =>
  fc.array(fc.constantFrom(...alfabeto), { maxLength: max }).map((partes) => partes.join(""));

/** Captura construida a partir de un número conocido `D` (sin ceros a la izquierda). */
interface CapturaConocida {
  entrada: string;
  D: string;
  ceros: number;
}

/**
 * Captura de D = "9999" + `minResto`..`maxResto` dígitos, precedida de 0 a 5 ceros, con una racha de 0 a 2
 * separadores de S antes del primer carácter, entre cada par de caracteres consecutivos y después del
 * último, salvo entre los dos últimos dígitos de D, que van pegados para que la regla NIT (NF-08) no
 * pueda activarse.
 */
const capturaConocida = (minResto: number, maxResto: number): fc.Arbitrary<CapturaConocida> =>
  fc
    .tuple(
      fc.array(fc.constantFrom(...DIGITOS_ASCII), { minLength: minResto, maxLength: maxResto }),
      fc.integer({ min: 0, max: 5 }),
    )
    .chain(([resto, ceros]) => {
      const D = "9999" + resto.join("");
      const caracteres = "0".repeat(ceros) + D;
      return fc.array(racha(SEPARADORES_ADMITIDOS, 2), {
        minLength: caracteres.length + 1,
        maxLength: caracteres.length + 1,
      }).map((rachas) => {
        let entrada = rachas[0];
        for (let i = 0; i < caracteres.length; i++) {
          const pegadoAlUltimo = i === caracteres.length - 2;
          entrada += caracteres[i] + (pegadoAlUltimo ? "" : rachas[i + 1]);
        }
        return { entrada, D, ceros };
      });
    });

/** G_cc: D de 5 a 10 dígitos (NF-14, cédula). */
const G_cc = capturaConocida(1, 6);
/** G_ti: D de 10 u 11 dígitos (NF-14, tarjeta de identidad). */
const G_ti = capturaConocida(6, 7);
/** Entrada de G_cc o de G_ti (NF-02: nunca lanza y determinismo). */
const capturaCcOTi = fc.oneof(G_cc, G_ti).map((c) => c.entrada);
/**
 * G_sinGuion: de 0 a 12 dígitos ASCII cualesquiera (el primero puede ser 0) con rachas de 0 a 3 caracteres
 * de punto y W antes, entre y después. Sin guiones: la regla NIT no aplica (NF-14). La cantidad de dígitos
 * se elige uniforme en 0..12: `fc.array` con `maxLength` sesga hacia arreglos cortos y dejaba la tarjeta de
 * identidad (10 u 11 dígitos) por debajo del 10 % de casos válidos.
 */
const G_sinGuion = fc
  .integer({ min: 0, max: 12 })
  .chain((n) => fc.array(fc.constantFrom(...DIGITOS_ASCII), { minLength: n, maxLength: n }))
  .chain((digitos) =>
    fc
      .array(racha([".", ...BLANCOS_ADMITIDOS], 3), { minLength: digitos.length + 1, maxLength: digitos.length + 1 })
      .map((rachas) => rachas[0] + digitos.map((d, i) => d + rachas[i + 1]).join("")),
  );

/** ¿Contiene la cadena algún guion de NF-03? */
const tieneGuion = (s: string) => GUIONES_ADMITIDOS.some((h) => s.includes(h));

/** ¿Contiene la cadena algún code point (o surrogate aislado) que no es dígito ASCII ni separador de NF-03? */
const tieneNoAdmitido = (s: string) =>
  [...s].some((c) => !DIGITOS_ASCII.includes(c) && !SEPARADORES_ADMITIDOS.includes(c));

/**
 * Contadores de cobertura de una propiedad (salvaguarda contra vacuidad; design.md de
 * pruebas-nuip-y-evals-robustas, decisión 2). El predicado llama a `caso` una vez por ejecución con las
 * categorías que cumple; después de `fc.assert`, `proporcion` da la fracción sobre los casos ejecutados
 * (el denominador es el contador, no la constante `numRuns`).
 */
function crearContadores() {
  const cuentas = new Map<string, number>();
  let total = 0;
  return {
    caso(marcas: Record<string, boolean>): void {
      total += 1;
      for (const [categoria, cumple] of Object.entries(marcas)) {
        if (cumple) cuentas.set(categoria, (cuentas.get(categoria) ?? 0) + 1);
      }
    },
    get total(): number {
      return total;
    },
    veces(categoria: string): number {
      return cuentas.get(categoria) ?? 0;
    },
    proporcion(categoria: string): number {
      return total === 0 ? 0 : (cuentas.get(categoria) ?? 0) / total;
    },
  };
}

describe("validarFormatoNuip", () => {
  describe("NF-01 Forma del resultado", () => {
    it("Resultado válido con todas sus claves", () => {
      expect(validarFormatoNuip("9999123456")).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
    });

    it("Resultado inválido con solo valido y motivo", () => {
      expect(validarFormatoNuip("9999")).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });

    it("Motivos nuevos con solo valido y motivo (entrada-no-texto)", () => {
      expect(validarFormatoNuip(9999123456)).toStrictEqual({ valido: false, motivo: "entrada-no-texto" });
    });

    it("Motivos nuevos con solo valido y motivo (tipo-documento-invalido)", () => {
      expect(validarFormatoNuip("9999123456", { tipoDocumento: "xx" })).toStrictEqual({
        valido: false,
        motivo: "tipo-documento-invalido",
      });
    });

    it("Motivos nuevos con solo valido y motivo (entrada-demasiado-larga)", () => {
      expect(validarFormatoNuip("9".repeat(65))).toStrictEqual({ valido: false, motivo: "entrada-demasiado-larga" });
    });
  });

  describe("NF-02 Función pura y total", () => {
    it("NF-02 / NF-11 Nunca lanza con valores arbitrarios como entrada (atrapa: excepción, forma distinta de NF-01 o motivo distinto de entrada-no-texto con no texto sin opciones)", () => {
      // Cubre también el escenario de NF-11 "Propiedad sobre valores arbitrarios que no son texto" cuando no se pasan opciones
      // (design.md de pruebas-nuip-y-evals-robustas, decisión 9). fc.anything() da cadenas en torno al 9 % de
      // los casos: con 1500 ejecuciones se exigen al menos 1000 valores que no son texto (unos 1365 esperados).
      const cuenta = crearContadores();
      fc.assert(
        fc.property(fc.anything(), (v) => {
          const r = validarFormatoNuip(v);
          expect(cumpleFormaNf01(r)).toBe(true);
          if (typeof v !== "string") expect(r).toStrictEqual(NO_TEXTO);
          cuenta.caso({ noTexto: typeof v !== "string", texto: typeof v === "string" });
        }),
        { numRuns: 1500 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1500);
      expect(cuenta.veces("noTexto")).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("texto")).toBeGreaterThanOrEqual(0.03);
    });

    it("NF-02 Nunca lanza con opciones arbitrarias (atrapa: excepción o resultado distinto de los dos objetos del escenario)", () => {
      // Disyunción literal (design.md de pruebas-nuip-y-evals-robustas, decisión 6): el resultado es exactamente
      // NUIP_VALIDO o exactamente TIPO_INVALIDO, sin clasificar `opciones` por tipo. Los contadores comprueban
      // que fc.anything() ejercita las dos ramas.
      const cuenta = crearContadores();
      fc.assert(
        fc.property(fc.anything(), (opciones) => {
          const r = validarFormatoNuip("9999123456", opciones);
          expect(r).toStrictEqual(r.valido ? NUIP_VALIDO : TIPO_INVALIDO);
          cuenta.caso({ valido: r.valido, invalido: !r.valido });
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("valido")).toBeGreaterThanOrEqual(0.1);
      expect(cuenta.proporcion("invalido")).toBeGreaterThanOrEqual(0.1);
    });

    it("Nunca lanza con fc.string({ unit: 'binary' }) y cumple NF-01", () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary" }), (s) => cumpleFormaNf01(validarFormatoNuip(s))),
        { numRuns: 1000 },
      );
    });

    it("Nunca lanza con fc.string() y cumple NF-01", () => {
      fc.assert(
        fc.property(fc.string(), (s) => cumpleFormaNf01(validarFormatoNuip(s))),
        { numRuns: 1000 },
      );
    });

    it("Nunca lanza con capturas válidas por construcción y cumple NF-01", () => {
      fc.assert(
        fc.property(capturaCcOTi, (s) => {
          expect(s.length).toBeLessThanOrEqual(64);
          expect(cumpleFormaNf01(validarFormatoNuip(s))).toBe(true);
        }),
        { numRuns: 1000 },
      );
    });

    it("Determinismo", () => {
      expect(validarFormatoNuip("9.999.123.456")).toStrictEqual(validarFormatoNuip("9.999.123.456"));
    });

    it("Determinismo (propiedad)", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), capturaCcOTi), (s) => {
          expect(validarFormatoNuip(s)).toStrictEqual(validarFormatoNuip(s));
        }),
        { numRuns: 1000 },
      );
    });

    it("NF-02 Idempotencia de la normalización en cédula (atrapa: segunda validación distinta o generador vacío)", () => {
      const cuenta = crearContadores();
      fc.assert(
        fc.property(G_cc, ({ entrada }) => {
          expect(entrada.length).toBeLessThanOrEqual(64);
          const primero = validarFormatoNuip(entrada);
          cuenta.caso({ valido: primero.valido });
          if (!primero.valido) return;
          expect(validarFormatoNuip(primero.numero)).toStrictEqual(primero);
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("valido"), "vacuidad: proporción de casos válidos en cédula").toBeGreaterThan(0.5);
    });

    it("NF-02 Idempotencia de la normalización en tarjeta de identidad (atrapa: segunda validación distinta o generador vacío)", () => {
      const ti = { tipoDocumento: "ti" } as const;
      const cuenta = crearContadores();
      fc.assert(
        fc.property(G_ti, ({ entrada }) => {
          expect(entrada.length).toBeLessThanOrEqual(64);
          const primero = validarFormatoNuip(entrada, ti);
          cuenta.caso({ valido: primero.valido });
          if (!primero.valido) return;
          expect(validarFormatoNuip(primero.numero, ti)).toStrictEqual(primero);
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("valido"), "vacuidad: proporción de casos válidos en tarjeta de identidad").toBeGreaterThan(
        0.5,
      );
    });
  });

  describe("NF-03 Separadores admitidos", () => {
    it("Puntos de miles", () => {
      const r = validarFormatoNuip("9.999.123.456");
      expect(r.valido).toBe(true);
      expect(r).toMatchObject({ numero: "9999123456", digitos: 10 });
    });

    it("Espacios, guiones y espacio duro", () => {
      for (const entrada of ["9 999 123 456", "9999-123-456", `9${NBSP}999${NBSP}123${NBSP}456`]) {
        expect(validarFormatoNuip(entrada)).toMatchObject({ valido: true, numero: "9999123456" });
      }
    });

    it("Espacio en blanco alrededor de la captura", () => {
      for (const entrada of ["  9999123456\n", "9999123456\r\n", "\t9999\t123456"]) {
        expect(validarFormatoNuip(entrada)).toMatchObject({ valido: true, numero: "9999123456" });
      }
    });

    it("Agrupación irregular no se valida", () => {
      expect(validarFormatoNuip("99.99-12 3456")).toMatchObject({ valido: true, numero: "9999123456" });
    });

    it("Espacio estrecho sin corte de PDF", () => {
      expect(validarFormatoNuip("9\u202F999\u202F123\u202F456")).toStrictEqual(NUIP_VALIDO);
    });

    it("Variantes de guion de OCR y PDF", () => {
      for (const entrada of [
        "9999\u2010123\u2010456",
        "9999\u2011123\u2011456",
        "9999\u2013123\u2013456",
        "9999\u2212123\u2212456",
      ]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NUIP_VALIDO);
      }
    });

    it("Cada separador admitido se elimina en cualquier posición (cédula y tarjeta de identidad)", () => {
      for (const sep of SEPARADORES_ADMITIDOS) {
        const entrada = `${sep}9999${sep}123456${sep}${sep}`;
        expect(validarFormatoNuip(entrada)).toStrictEqual(NUIP_VALIDO);
        expect(validarFormatoNuip(entrada, { tipoDocumento: "ti" })).toStrictEqual(NUIP_VALIDO);
      }
    });

    it("Propiedad P1: dígitos ASCII y separadores de NF-03 nunca dan caracteres-invalidos", () => {
      fc.assert(
        fc.property(digitosYSeparadores(64), fc.constantFrom(undefined, { tipoDocumento: "ti" }), (s, opciones) => {
          const r = validarFormatoNuip(s, opciones);
          expect(cumpleFormaNf01(r)).toBe(true);
          expect(r).not.toStrictEqual({ valido: false, motivo: "caracteres-invalidos" });
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("NF-04 Ceros a la izquierda", () => {
    it("Ceros a la izquierda en un NUIP", () => {
      expect(validarFormatoNuip("0009999123456")).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
    });

    it("Diez caracteres con cero inicial no son NUIP", () => {
      expect(validarFormatoNuip("0999912345")).toStrictEqual({
        valido: true,
        numero: "999912345",
        tipoProbable: "cedula-antigua",
        digitos: 9,
        warnings: [],
      });
    });

    it("Solo ceros", () => {
      expect(validarFormatoNuip("0.000.000")).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });
  });

  describe("NF-05 Rechazo de caracteres no admitidos", () => {
    const invalido = { valido: false, motivo: "caracteres-invalidos" };

    it("Letra confundible con dígito", () => {
      expect(validarFormatoNuip("9999I23456")).toStrictEqual(invalido);
    });

    it("Letra O en lugar de cero", () => {
      expect(validarFormatoNuip("99991234O6")).toStrictEqual(invalido);
    });

    it("Signos que no son separadores admitidos", () => {
      for (const entrada of ["9,999,123,456", "9999/123456", "+9999123456", "9999_123456"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(invalido);
      }
    });

    it("Dígitos no ASCII", () => {
      expect(validarFormatoNuip("\uFF19\uFF19\uFF19\uFF19\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16")).toStrictEqual(invalido);
    });

    it("Prioridad sobre la longitud", () => {
      expect(validarFormatoNuip("9A")).toStrictEqual(invalido);
    });

    it("Espacios Unicode no admitidos", () => {
      for (const entrada of [
        "\uFEFF9999123456",
        "9999123456\u2028",
        "9999\u2029123456",
        "9999\u3000123456",
        "9\u2007999\u2007123\u2007456",
      ]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(invalido);
      }
    });

    it("Otros espacios fuera de la lista", () => {
      for (const entrada of ["9999\u000B123456", "9999\u000C123456", "9999\u0085123456", "9999\u2009123456"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(invalido);
      }
    });

    it("Guiones fuera de la lista", () => {
      for (const entrada of ["9999\u2012123456", "9999\u2014123456", "9999\uFE63123456", "9999\uFF0D123456"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(invalido);
      }
    });

    it("Surrogate aislado", () => {
      expect(validarFormatoNuip("9999123456\uD800")).toStrictEqual(invalido);
    });

    it("Propiedad P2 (fuzz): insertar un carácter no admitido da caracteres-invalidos", () => {
      fc.assert(
        fc.property(
          digitosYSeparadores(62),
          caracterNoAdmitido,
          fc.nat(),
          fc.constantFrom(undefined, { tipoDocumento: "ti" }),
          (base, c, n, opciones) => {
            const pos = n % (base.length + 1);
            const entrada = base.slice(0, pos) + c + base.slice(pos);
            expect(entrada.length).toBeLessThanOrEqual(64);
            expect(validarFormatoNuip(entrada, opciones)).toStrictEqual(invalido);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe("NF-06 Entrada vacía", () => {
    it("Cadena vacía", () => {
      expect(validarFormatoNuip("")).toStrictEqual({ valido: false, motivo: "vacio" });
    });

    it("Solo separadores", () => {
      for (const entrada of ["   ", " .-. \t"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual({ valido: false, motivo: "vacio" });
      }
    });

    it("Guion solo", () => {
      for (const entrada of ["-", "\u2013 \u2212"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual({ valido: false, motivo: "vacio" });
      }
    });

    it("Espacio no admitido no cuenta como vacío", () => {
      for (const entrada of ["\u3000", "\uFEFF"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual({ valido: false, motivo: "caracteres-invalidos" });
      }
    });
  });

  describe("NF-07 Longitud y tipo probable para cédula de ciudadanía", () => {
    it("Límite inferior aceptado", () => {
      expect(validarFormatoNuip("99991")).toStrictEqual({
        valido: true,
        numero: "99991",
        tipoProbable: "cedula-antigua",
        digitos: 5,
        warnings: [],
      });
    });

    it("Cuatro dígitos", () => {
      expect(validarFormatoNuip("9999")).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });

    it("Nueve dígitos", () => {
      expect(validarFormatoNuip("999.912.345")).toStrictEqual({
        valido: true,
        numero: "999912345",
        tipoProbable: "cedula-antigua",
        digitos: 9,
        warnings: [],
      });
    });

    it("Diez dígitos es NUIP", () => {
      expect(validarFormatoNuip("9999123456")).toMatchObject({ tipoProbable: "nuip", digitos: 10 });
    });

    it("Once dígitos en cédula", () => {
      expect(validarFormatoNuip("99991234567")).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });
  });

  describe("NF-08 Sin dígito de control", () => {
    it("Cualquier último dígito es válido", () => {
      for (let d = 0; d <= 9; d++) {
        const entrada = `999912345${d}`;
        expect(validarFormatoNuip(entrada)).toMatchObject({ valido: true, tipoProbable: "nuip", numero: entrada });
      }
    });

    it("Formato estilo NIT con guion se rechaza", () => {
      for (const entrada of ["999.912.345-6", "999912345-6", "999.912.345-6 "]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual({ valido: false, motivo: "posible-digito-verificacion" });
      }
    });

    it("Dígito de verificación separado por espacios", () => {
      for (const entrada of ["999.912.345- 6", "999.912.345 - 6"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NIT);
      }
    });

    it("Separador después del dígito de verificación", () => {
      for (const entrada of ["999.912.345-6.", "999.912.345-6-"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NIT);
      }
    });

    it("Variantes de guion activan la regla", () => {
      for (const entrada of [
        "999.912.345\u20136",
        "999912345 \u2212 6",
        "999912345\u20106",
        "999912345\u2011\u00A06",
      ]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NIT);
      }
    });

    it("Guion y un solo dígito sin número delante", () => {
      for (const entrada of ["-6", "0-0"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NIT);
      }
    });

    it("Cada guion de NF-03 y cada separador alrededor del dígito activan la regla", () => {
      for (const guion of GUIONES_ADMITIDOS) {
        for (const sep of SEPARADORES_ADMITIDOS) {
          expect(validarFormatoNuip(`999912345${guion}${sep}6`)).toStrictEqual(NIT);
          expect(validarFormatoNuip(`999912345${guion}6${sep}`)).toStrictEqual(NIT);
        }
      }
    });

    it("Guion final seguido de más de un dígito es separador", () => {
      expect(validarFormatoNuip("9999-123-456")).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
    });

    it("Guion final aislado es separador", () => {
      for (const entrada of ["9999123456-", "9999123456 - "]) {
        expect(validarFormatoNuip(entrada)).toMatchObject({ valido: true, numero: "9999123456" });
      }
    });

    it("Dígito final aislado sin guion no activa la regla", () => {
      for (const entrada of ["9999-123-45 6", "999912345.6"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NUIP_VALIDO);
      }
    });

    it("Prioridad de caracteres inválidos sobre el patrón NIT", () => {
      for (const entrada of ["999A12345-6", "999912345-6\u3000"]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual({ valido: false, motivo: "caracteres-invalidos" });
      }
    });

    it("Prioridad del patrón NIT sobre la longitud", () => {
      expect(validarFormatoNuip("99-6")).toStrictEqual(NIT);
    });

    it("NF-08 Patrón NIT tras agrupación con guiones (atrapa: regla NIT que exige un número sin guiones antes del dígito de verificación)", () => {
      const ti = { tipoDocumento: "ti" } as const;
      expect(validarFormatoNuip("9999-12345-6")).toStrictEqual({ valido: false, motivo: "posible-digito-verificacion" });
      expect(validarFormatoNuip("9999-12345-6", ti)).toStrictEqual({ valido: false, motivo: "posible-digito-verificacion" });
      expect(validarFormatoNuip("99.99-123.45 - 6")).toStrictEqual({ valido: false, motivo: "posible-digito-verificacion" });
      expect(validarFormatoNuip("99.99-123.45 - 6", ti)).toStrictEqual({
        valido: false,
        motivo: "posible-digito-verificacion",
      });
    });

    /**
     * N de la propiedad P3 con número agrupado (design.md de pruebas-nuip-y-evals-robustas, decisión 8): vacío
     * o de 1 a 11 dígitos ASCII (cantidad uniforme en 0..11) con rachas de 0 a 2 separadores de S, guiones
     * incluidos, entre dígitos consecutivos; empieza y termina en dígito. Cota: 11 + 10 × 2 = 31.
     */
    const numeroAgrupado = fc
      .integer({ min: 0, max: 11 })
      .chain((k) => fc.array(fc.constantFrom(...DIGITOS_ASCII), { minLength: k, maxLength: k }))
      .chain((digitos) =>
        fc
          .array(racha(SEPARADORES_ADMITIDOS, 2), {
            minLength: Math.max(digitos.length - 1, 0),
            maxLength: Math.max(digitos.length - 1, 0),
          })
          .map((rachas) => digitos.map((d, i) => (i === 0 ? d : rachas[i - 1] + d)).join("")),
      );

    const tiposP3 = [
      { nombre: "sin tipo de documento", opciones: undefined },
      { nombre: 'con tipo de documento "ti"', opciones: { tipoDocumento: "ti" } },
    ];
    for (const { nombre, opciones } of tiposP3) {
      it(`NF-08 Propiedad del patrón NIT con número agrupado, ${nombre} (atrapa: dígito de verificación absorbido cuando el número lleva guiones o separadores)`, () => {
        const cuenta = crearContadores();
        fc.assert(
          fc.property(
            numeroAgrupado,
            racha(SEPARADORES_ADMITIDOS, 10),
            fc.constantFrom(...GUIONES_ADMITIDOS),
            racha(SEPARADORES_ADMITIDOS, 10),
            fc.constantFrom(...DIGITOS_ASCII),
            racha(SEPARADORES_ADMITIDOS, 10),
            (n, a, h, b, d, c) => {
              const entrada = n + a + h + b + d + c;
              cuenta.caso({ hasta64: entrada.length <= 64, guionEnN: tieneGuion(n) });
              expect(entrada.length).toBeLessThanOrEqual(64);
              expect(validarFormatoNuip(entrada, opciones)).toStrictEqual(NIT);
            },
          ),
          { numRuns: 1000 },
        );
        expect(cuenta.total).toBeGreaterThanOrEqual(1000);
        expect(cuenta.proporcion("hasta64"), "entradas de 64 caracteres o menos").toBe(1);
        expect(cuenta.proporcion("guionEnN"), "cobertura: guion de NF-03 dentro de N").toBeGreaterThanOrEqual(0.25);
      });
    }

    it("Propiedad P4: sin ningún guion de NF-03 nunca da posible-digito-verificacion", () => {
      const sinGuiones = fc
        .array(fc.constantFrom(...DIGITOS_ASCII, ".", ...BLANCOS_ADMITIDOS), { maxLength: 64 })
        .map((partes) => partes.join(""));
      fc.assert(
        fc.property(sinGuiones, fc.constantFrom(undefined, { tipoDocumento: "ti" }), (s, opciones) => {
          const r = validarFormatoNuip(s, opciones);
          expect(cumpleFormaNf01(r)).toBe(true);
          expect(r).not.toStrictEqual(NIT);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("NF-09 Tarjeta de identidad", () => {
    const ti = { tipoDocumento: "ti" } as const;

    it("Tarjeta de identidad de 10 dígitos", () => {
      expect(validarFormatoNuip("9999123456", ti)).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
    });

    it("Tarjeta de identidad de 11 dígitos marca la hipótesis", () => {
      expect(validarFormatoNuip("99991234567", ti)).toStrictEqual({
        valido: true,
        numero: "99991234567",
        tipoProbable: "ti-antigua",
        digitos: 11,
        warnings: ["N01"],
      });
    });

    it("Patrón NIT también se rechaza en tarjeta de identidad", () => {
      expect(validarFormatoNuip("9999123456-7", ti)).toStrictEqual({
        valido: false,
        motivo: "posible-digito-verificacion",
      });
    });

    it("Patrón NIT con espacios o separador final en tarjeta de identidad", () => {
      for (const entrada of ["9999123456 - 7", "9999123456-\u00A07", "9999123456-7."]) {
        expect(validarFormatoNuip(entrada, ti)).toStrictEqual(NIT);
      }
    });

    it("Tarjeta de identidad con ceros a la izquierda", () => {
      expect(validarFormatoNuip("09999123456", ti)).toStrictEqual(NUIP_VALIDO);
    });

    it("Tarjeta de identidad corta", () => {
      expect(validarFormatoNuip("999912345", ti)).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });

    it("Tarjeta de identidad de 12 dígitos", () => {
      expect(validarFormatoNuip("999912345678", ti)).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });

    it("Tipo explícito cc equivale al defecto", () => {
      expect(validarFormatoNuip("99991", { tipoDocumento: "cc" })).toStrictEqual(validarFormatoNuip("99991"));
    });

    it("Nunca lanza y cumple NF-01 con tipo de documento ti (NF-02)", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" })), (s) => {
          expect(cumpleFormaNf01(validarFormatoNuip(s, ti))).toBe(true);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("NF-10 Normalización y rechazo del tipo de documento", () => {
    const longitudInvalida = { valido: false, motivo: "longitud-invalida" };

    it("Mayúsculas se normalizan", () => {
      expect(validarFormatoNuip("99991234567", { tipoDocumento: "TI" })).toStrictEqual({
        valido: true,
        numero: "99991234567",
        tipoProbable: "ti-antigua",
        digitos: 11,
        warnings: ["N01"],
      });
      expect(validarFormatoNuip("9999123456", { tipoDocumento: "Ti" })).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
    });

    it("Espacio en blanco alrededor del tipo", () => {
      expect(validarFormatoNuip("99991234567", { tipoDocumento: " ti\n" })).toStrictEqual({
        valido: true,
        numero: "99991234567",
        tipoProbable: "ti-antigua",
        digitos: 11,
        warnings: ["N01"],
      });
    });

    it("CC en mayúsculas se trata como cédula", () => {
      expect(validarFormatoNuip("99991234567", { tipoDocumento: "CC" })).toStrictEqual(longitudInvalida);
    });

    it("Texto de tipo desconocido", () => {
      for (const tipoDocumento of ["xx", "", "   ", "t i", "nuip", "ce"]) {
        expect(validarFormatoNuip("9999123456", { tipoDocumento })).toStrictEqual(TIPO_INVALIDO);
      }
    });

    it("Tipo de documento que no es texto", () => {
      for (const opciones of [
        { tipoDocumento: 1 },
        { tipoDocumento: true },
        { tipoDocumento: null },
        { tipoDocumento: {} },
        { tipoDocumento: ["ti"] },
      ]) {
        expect(validarFormatoNuip("9999123456", opciones)).toStrictEqual(TIPO_INVALIDO);
      }
    });

    it("Opciones primitivas", () => {
      for (const opciones of ["ti", 0, true]) {
        expect(validarFormatoNuip("9999123456", opciones)).toStrictEqual(TIPO_INVALIDO);
      }
    });

    it("Opciones ausentes o vacías equivalen a cédula", () => {
      for (const opciones of [undefined, null, {}]) {
        expect(validarFormatoNuip("99991234567", opciones)).toStrictEqual(longitudInvalida);
      }
    });

    it("Opciones función se leen como objeto (design.md, decisión 3)", () => {
      const conTipo = Object.assign(() => undefined, { tipoDocumento: "ti" });
      const sinTipo = () => undefined;
      expect(validarFormatoNuip("99991234567", conTipo)).toStrictEqual(TI_ANTIGUA);
      expect(validarFormatoNuip("99991234567", sinTipo)).toStrictEqual(longitudInvalida);
    });

    it("Prioridad del tipo inválido sobre los motivos de la entrada", () => {
      for (const entrada of ["9999I23456", "", "99-6", "9".repeat(65)]) {
        expect(validarFormatoNuip(entrada, { tipoDocumento: "xx" })).toStrictEqual(TIPO_INVALIDO);
      }
    });

    it("NF-10 tipoDocumento se lee una sola vez (atrapa: segunda lectura del accesor)", () => {
      // design.md de pruebas-nuip-y-evals-robustas, decisión 7: la primera lectura da "ti" y las siguientes "xx".
      let lecturas = 0;
      const opciones = {};
      Object.defineProperty(opciones, "tipoDocumento", {
        get() {
          lecturas += 1;
          return lecturas === 1 ? "ti" : "xx";
        },
      });
      expect(validarFormatoNuip("99991234567", opciones)).toStrictEqual(TI_ANTIGUA);
      expect(lecturas).toBe(1);
    });

    it("NF-10 Variantes aceptadas del tipo de documento (atrapa: mayúscula o blanco de W sin normalizar)", () => {
      for (const tipoDocumento of ["cc", "CC", "Cc", "cC", " cc", "cc\t", "\ncC\r", " CC "]) {
        expect(validarFormatoNuip("99991234567", { tipoDocumento })).toStrictEqual(longitudInvalida);
      }
      for (const tipoDocumento of ["ti", "TI", "Ti", "tI", " ti", "ti\n", "\tTI\r", " Ti "]) {
        expect(validarFormatoNuip("99991234567", { tipoDocumento })).toStrictEqual(TI_ANTIGUA);
      }
    });

    it("NF-10 Casos frontera rechazados (atrapa: prefijo, diacrítico, i sin punto o separador aceptados)", () => {
      // "t\u00EC": i con acento grave; "t\u0131": i sin punto (su mayúscula es "I").
      for (const tipoDocumento of ["ti.", "t\u00EC", "t\u0131", "tii", "t", "i", "c", "ccc", "c c", "cc-", "-ti", "t-i"]) {
        expect(validarFormatoNuip("9999123456", { tipoDocumento })).toStrictEqual(TIPO_INVALIDO);
      }
    });

    it("NF-10 Propiedad sobre texto sin las letras de cc ni ti (atrapa: texto ajeno aceptado como tipo)", () => {
      // El generador se restringe (design.md, decisión 4c); el esperado es literal.
      const sinLetrasDeCcNiTi = (t: string) => !/[cCtTiI]/.test(t);
      for (const generador of [fc.string(), fc.string({ unit: "binary" })]) {
        const cuenta = crearContadores();
        fc.assert(
          fc.property(generador.filter(sinLetrasDeCcNiTi), (tipoDocumento) => {
            expect(validarFormatoNuip("9999123456", { tipoDocumento })).toStrictEqual(TIPO_INVALIDO);
            cuenta.caso({});
          }),
          { numRuns: 1000 },
        );
        expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      }
    });

    it("NF-10 Propiedad sobre variantes generadas de cc y ti (atrapa: mayúscula o blanco de W sin normalizar)", () => {
      // Blancos solo de W (design.md, decisión 5): U+3000 y U+FEFF quedan fuera hasta decidir el hueco #1.
      const blancos = racha(BLANCOS_ADMITIDOS, 3);
      const variante = (canonico: "cc" | "ti", primera: readonly string[], segunda: readonly string[]) =>
        fc
          .tuple(blancos, fc.constantFrom(...primera), fc.constantFrom(...segunda), blancos)
          .map(([antes, x, y, despues]) => ({ canonico, tipoDocumento: antes + x + y + despues }));
      // Tablas literales de NF-07 y NF-09 por entrada.
      const cedulaAntigua = { valido: true, numero: "99991", tipoProbable: "cedula-antigua", digitos: 5, warnings: [] };
      const esperados = {
        cc: { "99991234567": longitudInvalida, "9999123456": NUIP_VALIDO, "99991": cedulaAntigua },
        ti: { "99991234567": TI_ANTIGUA, "9999123456": NUIP_VALIDO, "99991": longitudInvalida },
      };
      const cuenta = crearContadores();
      fc.assert(
        fc.property(
          fc.oneof(variante("cc", ["c", "C"], ["c", "C"]), variante("ti", ["t", "T"], ["i", "I"])),
          ({ canonico, tipoDocumento }) => {
            for (const [entrada, esperado] of Object.entries(esperados[canonico])) {
              expect(validarFormatoNuip(entrada, { tipoDocumento })).toStrictEqual(esperado);
            }
            cuenta.caso({
              cc: canonico === "cc",
              ti: canonico === "ti",
              conBlanco: tipoDocumento.length > 2,
              conMayuscula: /[CTI]/.test(tipoDocumento),
            });
          },
        ),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("cc")).toBeGreaterThanOrEqual(0.25);
      expect(cuenta.proporcion("ti")).toBeGreaterThanOrEqual(0.25);
      expect(cuenta.proporcion("conBlanco")).toBeGreaterThanOrEqual(0.25);
      expect(cuenta.proporcion("conMayuscula")).toBeGreaterThanOrEqual(0.25);
    });

    it("NF-10 Propiedad sobre tipoDocumento que no es texto (atrapa: valor no texto aceptado o convertido a texto)", () => {
      fc.assert(
        fc.property(
          fc.anything().filter((v) => typeof v !== "string" && v !== undefined),
          (tipoDocumento) => {
            expect(validarFormatoNuip("99991234567", { tipoDocumento })).toStrictEqual(TIPO_INVALIDO);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("NF-10 Propiedad sobre opciones primitivas (atrapa: opciones primitivas leídas como objeto o como cédula)", () => {
      const primitiva = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.double(),
        fc.boolean(),
        fc.bigInt(),
        fc.string().map((descripcion) => Symbol(descripcion)),
      );
      fc.assert(
        fc.property(primitiva, (opciones) => {
          expect(validarFormatoNuip("9999123456", opciones)).toStrictEqual(TIPO_INVALIDO);
        }),
        { numRuns: 1000 },
      );
    });

    it("NF-10 Propiedad sobre objetos sin tipoDocumento (atrapa: objeto o array sin tipo rechazado)", () => {
      // Sin "__proto__" para no tocar el hueco #2 del backlog (design.md, decisión 6).
      const clave = fc.string().filter((k) => k !== "tipoDocumento" && k !== "__proto__");
      const sinTipo = fc.oneof(fc.dictionary(clave, fc.anything()), fc.array(fc.anything()));
      const cuenta = crearContadores();
      fc.assert(
        fc.property(sinTipo, (opciones) => {
          expect(validarFormatoNuip("9999123456", opciones)).toStrictEqual(NUIP_VALIDO);
          cuenta.caso({ array: Array.isArray(opciones), conClaves: Object.keys(opciones).length > 0 });
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("array")).toBeGreaterThanOrEqual(0.25);
      expect(cuenta.proporcion("conClaves")).toBeGreaterThanOrEqual(0.25);
    });
  });

  describe("NF-11 Entrada que no es texto", () => {
    const noTexto = fc.anything().filter((v) => typeof v !== "string");

    it("Números y otros primitivos", () => {
      for (const entrada of [9999123456, 9999123456n, true, null, undefined, Symbol("x")]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NO_TEXTO);
      }
    });

    it("Objetos", () => {
      const envoltorio = new String("9999123456");
      for (const entrada of [{}, ["9999123456"], envoltorio, { toString: () => "9999123456" }]) {
        expect(validarFormatoNuip(entrada)).toStrictEqual(NO_TEXTO);
      }
    });

    it("Prioridad sobre el tipo de documento inválido", () => {
      expect(validarFormatoNuip(9999123456, { tipoDocumento: "xx" })).toStrictEqual(NO_TEXTO);
    });

    it("Propiedad sobre valores arbitrarios que no son texto (con tipo de documento ti)", () => {
      fc.assert(
        fc.property(noTexto, (v) => {
          expect(validarFormatoNuip(v, { tipoDocumento: "ti" })).toStrictEqual(NO_TEXTO);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("NF-12 Longitud máxima de la entrada", () => {
    it("Límite exacto con separadores", () => {
      const de64 = "9999123456" + " ".repeat(54);
      const de65 = "9999123456" + " ".repeat(55);
      expect(de64.length).toBe(64);
      expect(de65.length).toBe(65);
      expect(validarFormatoNuip(de64)).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
      expect(validarFormatoNuip(de65)).toStrictEqual({ valido: false, motivo: "entrada-demasiado-larga" });
    });

    it("Límite exacto con ceros a la izquierda", () => {
      const entrada = "0".repeat(54) + "9999123456";
      expect(entrada.length).toBe(64);
      expect(validarFormatoNuip(entrada)).toStrictEqual({
        valido: true,
        numero: "9999123456",
        tipoProbable: "nuip",
        digitos: 10,
        warnings: [],
      });
    });

    it("El contenido de una entrada larga no se examina", () => {
      expect(validarFormatoNuip("A".repeat(65))).toStrictEqual({ valido: false, motivo: "entrada-demasiado-larga" });
      expect(validarFormatoNuip("A".repeat(64))).toStrictEqual({ valido: false, motivo: "caracteres-invalidos" });
    });

    it("Solo separadores por encima del límite", () => {
      expect(validarFormatoNuip(" ".repeat(65))).toStrictEqual({ valido: false, motivo: "entrada-demasiado-larga" });
      expect(validarFormatoNuip(" ".repeat(64))).toStrictEqual({ valido: false, motivo: "vacio" });
    });

    it("Patrón NIT por encima del límite", () => {
      const de64 = " ".repeat(60) + "99-6";
      const de65 = " ".repeat(61) + "99-6";
      expect(de64.length).toBe(64);
      expect(de65.length).toBe(65);
      expect(validarFormatoNuip(de64)).toStrictEqual({ valido: false, motivo: "posible-digito-verificacion" });
      expect(validarFormatoNuip(de65)).toStrictEqual({ valido: false, motivo: "entrada-demasiado-larga" });
    });

    it("Se cuentan unidades UTF-16", () => {
      const de64 = "\u{1D7FF}".repeat(32);
      const de66 = "\u{1D7FF}".repeat(33);
      expect(de64.length).toBe(64);
      expect(de66.length).toBe(66);
      expect(validarFormatoNuip(de64)).toStrictEqual({ valido: false, motivo: "caracteres-invalidos" });
      expect(validarFormatoNuip(de66)).toStrictEqual({ valido: false, motivo: "entrada-demasiado-larga" });
    });

    it("Entrada muy larga", () => {
      expect(validarFormatoNuip("9".repeat(1000000))).toStrictEqual({
        valido: false,
        motivo: "entrada-demasiado-larga",
      });
    });

    it("Propiedad sobre cadenas largas (sin tipo de documento)", () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary", minLength: 65 }), (s) => {
          expect(validarFormatoNuip(s)).toStrictEqual(DEMASIADO_LARGA);
        }),
        { numRuns: 1000 },
      );
    });

    it("Propiedad sobre cadenas largas (con tipo de documento ti)", () => {
      fc.assert(
        fc.property(fc.string({ unit: "binary", minLength: 65 }), (s) => {
          expect(validarFormatoNuip(s, { tipoDocumento: "ti" })).toStrictEqual(DEMASIADO_LARGA);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("NF-13 Prioridad de motivos", () => {
    it("Cadena de prioridades", () => {
      const motivos = [
        validarFormatoNuip(9999123456, { tipoDocumento: "xx" }),
        validarFormatoNuip("A".repeat(65), { tipoDocumento: "xx" }),
        validarFormatoNuip("A".repeat(65)),
        validarFormatoNuip("999A12345-6"),
        validarFormatoNuip("99-6"),
        validarFormatoNuip(""),
        validarFormatoNuip("9999"),
      ].map((r) => (r.valido ? undefined : r.motivo));
      expect(motivos).toStrictEqual([
        "entrada-no-texto",
        "tipo-documento-invalido",
        "entrada-demasiado-larga",
        "caracteres-invalidos",
        "posible-digito-verificacion",
        "vacio",
        "longitud-invalida",
      ]);
    });

    it("Vacío prevalece sobre la cantidad de dígitos", () => {
      expect(validarFormatoNuip(" .-. ")).toStrictEqual({ valido: false, motivo: "vacio" });
    });

    it("NF-13 Propiedad: el tipo inválido prevalece sobre cualquier cadena, binario (atrapa: caracteres-invalidos o vacio evaluados antes que el tipo de documento)", () => {
      // Vacuidad: sin el tipo inválido, los casos con un carácter no admitido darían caracteres-invalidos
      // (en torno al 90 %) y la cadena vacía daría vacio (en torno al 9 %).
      const cuenta = crearContadores();
      fc.assert(
        fc.property(fc.string({ unit: "binary" }), (s) => {
          expect(validarFormatoNuip(s, { tipoDocumento: "xx" })).toStrictEqual(TIPO_INVALIDO);
          cuenta.caso({ noAdmitido: tieneNoAdmitido(s), vacia: s === "" });
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("noAdmitido")).toBeGreaterThanOrEqual(0.5);
      expect(cuenta.proporcion("vacia")).toBeGreaterThanOrEqual(0.03);
    });

    it("NF-13 Propiedad: el tipo inválido prevalece sobre cualquier cadena, binario de 65 o más (atrapa: entrada-demasiado-larga evaluada antes que el tipo de documento)", () => {
      const cuenta = crearContadores();
      fc.assert(
        fc.property(fc.string({ unit: "binary", minLength: 65 }), (s) => {
          expect(validarFormatoNuip(s, { tipoDocumento: "xx" })).toStrictEqual(TIPO_INVALIDO);
          cuenta.caso({ larga: s.length > 64 });
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("larga")).toBe(1);
    });

    it("NF-13 Propiedad: la entrada no texto prevalece sobre cualquier opción (atrapa: tipo de documento evaluado antes que la entrada)", () => {
      // Vacuidad: las opciones que, con una entrada válida, dan tipo-documento-invalido son las que atrapan el
      // orden invertido; las que no, comprueban que el motivo no depende de las opciones. Se exige al menos un
      // 10 % de cada partición (misma medida que "NF-02 Nunca lanza con opciones arbitrarias").
      const cuenta = crearContadores();
      fc.assert(
        fc.property(
          fc.anything().filter((v) => typeof v !== "string"),
          fc.anything(),
          (v, opciones) => {
            expect(validarFormatoNuip(v, opciones)).toStrictEqual(NO_TEXTO);
            const conEntradaValida = validarFormatoNuip("9999123456", opciones);
            cuenta.caso({ opcionesInvalidas: !conEntradaValida.valido, opcionesValidas: conEntradaValida.valido });
          },
        ),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("opcionesInvalidas")).toBeGreaterThanOrEqual(0.1);
      expect(cuenta.proporcion("opcionesValidas")).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe("NF-14 Oráculo de normalización", () => {
    const ti = { tipoDocumento: "ti" } as const;

    interface FilaTabla {
      tipoProbable: string;
      warnings: readonly string[];
    }
    /** Tabla literal de NF-07 (cédula): longitud de D -> tipoProbable y warnings. */
    const TABLA_CC: Readonly<Partial<Record<number, FilaTabla>>> = {
      5: { tipoProbable: "cedula-antigua", warnings: [] },
      6: { tipoProbable: "cedula-antigua", warnings: [] },
      7: { tipoProbable: "cedula-antigua", warnings: [] },
      8: { tipoProbable: "cedula-antigua", warnings: [] },
      9: { tipoProbable: "cedula-antigua", warnings: [] },
      10: { tipoProbable: "nuip", warnings: [] },
    };
    /** Tabla literal de NF-09 (tarjeta de identidad; 11 dígitos es la hipótesis N01). */
    const TABLA_TI: Readonly<Partial<Record<number, FilaTabla>>> = {
      10: { tipoProbable: "nuip", warnings: [] },
      11: { tipoProbable: "ti-antigua", warnings: ["N01"] },
    };

    /** Resultado de la tabla literal para un D ya normalizado. */
    function segunTabla(D: string, tabla: Readonly<Partial<Record<number, FilaTabla>>>) {
      const fila = tabla[D.length];
      if (fila === undefined) return { valido: false, motivo: "longitud-invalida" };
      return { valido: true, numero: D, tipoProbable: fila.tipoProbable, digitos: D.length, warnings: [...fila.warnings] };
    }

    /**
     * Oráculo independiente para capturas sin guion: filtra los caracteres "0" a "9" (sin usar la lista de
     * separadores ni las expresiones de la implementación), quita los ceros iniciales y aplica la tabla literal.
     */
    function oraculoSinGuion(entrada: string, tabla: Readonly<Partial<Record<number, FilaTabla>>>) {
      const digitos = [...entrada].filter((c) => c >= "0" && c <= "9");
      if (digitos.length === 0) return { valido: false, motivo: "vacio" };
      let inicio = 0;
      while (inicio < digitos.length && digitos[inicio] === "0") inicio++;
      return segunTabla(digitos.slice(inicio).join(""), tabla);
    }

    it("NF-14 Captura válida por construcción en cédula (atrapa: numero distinto de D o tipoProbable fuera de la tabla)", () => {
      const cuenta = crearContadores();
      fc.assert(
        fc.property(G_cc, ({ entrada, D, ceros }) => {
          expect(entrada.length).toBeLessThanOrEqual(64);
          const r = validarFormatoNuip(entrada);
          expect(r).toStrictEqual(segunTabla(D, TABLA_CC));
          expect(r).toMatchObject({ valido: true, numero: D });
          cuenta.caso({
            valido: r.valido,
            nuip: r.valido && r.tipoProbable === "nuip",
            cedulaAntigua: r.valido && r.tipoProbable === "cedula-antigua",
            conCeros: ceros > 0,
            conGuion: tieneGuion(entrada),
          });
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("valido"), "vacuidad: válidos").toBeGreaterThan(0.5);
      expect(cuenta.proporcion("nuip"), "cobertura: nuip").toBeGreaterThanOrEqual(0.1);
      expect(cuenta.proporcion("cedulaAntigua"), "cobertura: cedula-antigua").toBeGreaterThanOrEqual(0.1);
      expect(cuenta.proporcion("conCeros"), "cobertura: ceros a la izquierda").toBeGreaterThanOrEqual(0.1);
      expect(cuenta.proporcion("conGuion"), "cobertura: guion de NF-03").toBeGreaterThanOrEqual(0.1);
    });

    it("NF-14 Captura válida por construcción en tarjeta de identidad (atrapa: numero distinto de D o tipoProbable y warnings fuera de la tabla)", () => {
      const cuenta = crearContadores();
      fc.assert(
        fc.property(G_ti, ({ entrada, D, ceros }) => {
          expect(entrada.length).toBeLessThanOrEqual(64);
          const r = validarFormatoNuip(entrada, ti);
          expect(r).toStrictEqual(segunTabla(D, TABLA_TI));
          expect(r).toMatchObject({ valido: true, numero: D });
          cuenta.caso({
            valido: r.valido,
            nuip: r.valido && r.tipoProbable === "nuip",
            tiAntigua: r.valido && r.tipoProbable === "ti-antigua",
            conCeros: ceros > 0,
            conGuion: tieneGuion(entrada),
          });
        }),
        { numRuns: 1000 },
      );
      expect(cuenta.total).toBeGreaterThanOrEqual(1000);
      expect(cuenta.proporcion("valido"), "vacuidad: válidos").toBeGreaterThan(0.5);
      expect(cuenta.proporcion("nuip"), "cobertura: nuip").toBeGreaterThanOrEqual(0.25);
      expect(cuenta.proporcion("tiAntigua"), "cobertura: ti-antigua").toBeGreaterThanOrEqual(0.25);
      expect(cuenta.proporcion("conCeros"), "cobertura: ceros a la izquierda").toBeGreaterThanOrEqual(0.1);
      expect(cuenta.proporcion("conGuion"), "cobertura: guion de NF-03").toBeGreaterThanOrEqual(0.1);
    });

    const porTipo = [
      { nombre: "sin tipo de documento", opciones: undefined, tabla: TABLA_CC },
      { nombre: 'con tipo de documento "ti"', opciones: ti, tabla: TABLA_TI },
    ];
    for (const { nombre, opciones, tabla } of porTipo) {
      it(`NF-14 Oráculo independiente sobre capturas sin guion, ${nombre} (atrapa: separador no eliminado, ceros mal quitados o longitud fuera de la tabla)`, () => {
        const cuenta = crearContadores();
        fc.assert(
          fc.property(G_sinGuion, (entrada) => {
            expect(entrada.length).toBeLessThanOrEqual(64);
            const r = validarFormatoNuip(entrada, opciones);
            expect(r).toStrictEqual(oraculoSinGuion(entrada, tabla));
            cuenta.caso({
              valido: r.valido,
              longitudInvalida: !r.valido && r.motivo === "longitud-invalida",
              vacio: !r.valido && r.motivo === "vacio",
            });
          }),
          { numRuns: 1000 },
        );
        expect(cuenta.total).toBeGreaterThanOrEqual(1000);
        expect(cuenta.proporcion("valido"), "cobertura: válidos").toBeGreaterThanOrEqual(0.1);
        expect(cuenta.proporcion("longitudInvalida"), "cobertura: longitud-invalida").toBeGreaterThanOrEqual(0.1);
        expect(cuenta.proporcion("vacio"), "cobertura: vacio").toBeGreaterThanOrEqual(0.03);
      });
    }

    it("NF-14 Ejemplos fijos del oráculo (atrapa: ceros intercalados tratados como iniciales o ceros solos como vacío)", () => {
      expect(validarFormatoNuip("0 0.9 999 1")).toStrictEqual({
        valido: true,
        numero: "99991",
        tipoProbable: "cedula-antigua",
        digitos: 5,
        warnings: [],
      });
      expect(validarFormatoNuip("0 0.9 999 1", ti)).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
      expect(validarFormatoNuip("00.000")).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });
  });
});
