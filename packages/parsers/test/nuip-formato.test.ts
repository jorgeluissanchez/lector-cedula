// fixture-sintetico: todos los números son sintéticos (empiezan por 9999 tras normalizar o son solo ceros).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validarFormatoNuip } from "../src/index.js";
import type { ResultadoFormatoNuip } from "../src/index.js";

const MOTIVOS = ["caracteres-invalidos", "posible-digito-verificacion", "vacio", "longitud-invalida"];
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

const NBSP = " ";

/** Cadenas formadas solo por dígitos y separadores admitidos: producen resultados válidos con frecuencia. */
const capturaPlausible = fc
  .array(fc.constantFrom(..."00123456789999.- \t\n".split(""), NBSP), { maxLength: 16 })
  .map((partes) => partes.join(""));

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
  });

  describe("NF-02 Función pura y total", () => {
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

    it("Nunca lanza con capturas plausibles y cumple NF-01", () => {
      fc.assert(
        fc.property(capturaPlausible, (s) => cumpleFormaNf01(validarFormatoNuip(s))),
        { numRuns: 1000 },
      );
    });

    it("Determinismo", () => {
      expect(validarFormatoNuip("9.999.123.456")).toStrictEqual(validarFormatoNuip("9.999.123.456"));
    });

    it("Determinismo (propiedad)", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), capturaPlausible), (s) => {
          expect(validarFormatoNuip(s)).toStrictEqual(validarFormatoNuip(s));
        }),
        { numRuns: 1000 },
      );
    });

    it("Idempotencia de la normalización", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), capturaPlausible), (s) => {
          const primero = validarFormatoNuip(s);
          if (!primero.valido) return;
          expect(validarFormatoNuip(primero.numero)).toStrictEqual(primero);
        }),
        { numRuns: 1000 },
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
      expect(validarFormatoNuip("  9999123456\n")).toMatchObject({ valido: true, numero: "9999123456" });
    });

    it("Agrupación irregular no se valida", () => {
      expect(validarFormatoNuip("99.99-12 3456")).toMatchObject({ valido: true, numero: "9999123456" });
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
      expect(validarFormatoNuip("９９９９１２３４５６")).toStrictEqual(invalido);
    });

    it("Prioridad sobre la longitud", () => {
      expect(validarFormatoNuip("9A")).toStrictEqual(invalido);
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
      expect(validarFormatoNuip("9999123456-")).toMatchObject({ valido: true, numero: "9999123456" });
    });

    it("Prioridad de caracteres inválidos sobre el patrón NIT", () => {
      expect(validarFormatoNuip("999A12345-6")).toStrictEqual({ valido: false, motivo: "caracteres-invalidos" });
    });

    it("Prioridad del patrón NIT sobre la longitud", () => {
      expect(validarFormatoNuip("99-6")).toStrictEqual({ valido: false, motivo: "posible-digito-verificacion" });
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

    it("Tarjeta de identidad corta", () => {
      expect(validarFormatoNuip("999912345", ti)).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });

    it("Tarjeta de identidad de 12 dígitos", () => {
      expect(validarFormatoNuip("999912345678", ti)).toStrictEqual({ valido: false, motivo: "longitud-invalida" });
    });

    it("Tipo explícito cc equivale al defecto", () => {
      expect(validarFormatoNuip("99991", { tipoDocumento: "cc" })).toStrictEqual(validarFormatoNuip("99991"));
    });

    it("Nunca lanza, cumple NF-01 y es idempotente con tipo de documento ti (NF-02)", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), capturaPlausible, fc.string({ unit: "binary" })), (s) => {
          const primero = validarFormatoNuip(s, ti);
          expect(cumpleFormaNf01(primero)).toBe(true);
          if (!primero.valido) return;
          expect(validarFormatoNuip(primero.numero, ti)).toStrictEqual(primero);
        }),
        { numRuns: 1000 },
      );
    });
  });
});
