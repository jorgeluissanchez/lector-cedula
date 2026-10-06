// Adaptador de evals del parser MRZ (cambio parser-mrz-cedula-digital, design.md decisión 12; requisito MZ-22).
// fixture-sintetico: R1 es el resultado de la base sintética B de la spec (NUIP y serial 9999...).
import { describe, expect, it } from "vitest";
import { aplanarMrz, EVALUADORES } from "../../evals/runners/registro.mjs";

/** R1 literal de MZ-01. */
const R1 = {
  ok: true,
  valido: true,
  campos: {
    serial: "999900123",
    codigoLugarMrz: "16001",
    fechaNacimiento: "1990-07-15",
    sexo: "F",
    fechaVencimiento: "2034-07-15",
    nacionalidad: "COL",
    nuip: "9999123456",
    nuipTipoProbable: "nuip",
    apellidos: "FICTICIO EJEMPLO",
    nombres: "ANA MARIA",
    nombresPosiblementeTruncados: false,
  },
  digitosControl: {
    serial: { estado: "valido", leido: "8", calculado: 8 },
    nacimiento: { estado: "valido", leido: "0", calculado: 0 },
    vencimiento: { estado: "valido", leido: "0", calculado: 0 },
    compuesto: { estado: "valido", leido: "5", calculado: 5 },
  },
  correcciones: [],
  errores: [],
  warnings: ["M03"],
  lineasCorregidas: ["ICCOL999900123816001<<<<<<<<<<", "9007150F3407150COL9999123456<5", "FICTICIO<EJEMPLO<<ANA<MARIA<<<"],
};

describe("MZ-22 adaptador aplanarMrz", () => {
  it("MZ-22 aplana un resultado ok: true (R1) con las claves de la decisión 12", () => {
    expect(aplanarMrz(R1)).toStrictEqual({
      ok: true,
      valido: true,
      serial: "999900123",
      codigoLugarMrz: "16001",
      fechaNacimiento: "1990-07-15",
      sexo: "F",
      fechaVencimiento: "2034-07-15",
      nacionalidad: "COL",
      nuip: "9999123456",
      nuipTipoProbable: "nuip",
      apellidos: "FICTICIO EJEMPLO",
      nombres: "ANA MARIA",
      nombresPosiblementeTruncados: false,
      cdSerial: "valido",
      cdNacimiento: "valido",
      cdVencimiento: "valido",
      cdCompuesto: "valido",
      correcciones: 0,
      errores: "",
      warnings: "M03",
    });
  });

  it("MZ-22 aplana un resultado con varias correcciones, errores y warnings (cuenta y une con coma)", () => {
    const r = {
      ...R1,
      valido: false,
      digitosControl: { ...R1.digitosControl, serial: { estado: "ausente", leido: "<", calculado: 8 }, compuesto: { estado: "invalido", leido: "9", calculado: 8 } },
      correcciones: [
        { linea: 1, columna: 3, original: "0", corregido: "O" },
        { linea: 2, columna: 16, original: "0", corregido: "O" },
      ],
      errores: ["nuip-invalido", "nombre-no-alfabetico"],
      warnings: ["M03", "X99"],
    };
    expect(aplanarMrz(r)).toMatchObject({
      valido: false,
      cdSerial: "ausente",
      cdCompuesto: "invalido",
      correcciones: 2,
      errores: "nuip-invalido,nombre-no-alfabetico",
      warnings: "M03,X99",
    });
  });

  it("MZ-22 aplana un rechazo con línea", () => {
    expect(aplanarMrz({ ok: false, motivo: "longitud-linea-invalida", linea: 3 })).toStrictEqual({ ok: false, motivo: "longitud-linea-invalida", linea: 3 });
  });

  it("MZ-22 aplana un rechazo sin línea con linea: null", () => {
    expect(aplanarMrz({ ok: false, motivo: "numero-lineas-invalido" })).toStrictEqual({ ok: false, motivo: "numero-lineas-invalido", linea: null });
  });

  it("MZ-22 registra el tipo mrz-cedula-digital con el módulo, la función y el adaptador de la decisión 12", () => {
    expect(EVALUADORES["mrz-cedula-digital"]).toStrictEqual({
      modulo: "packages/parsers/dist/index.js",
      exportar: "parsearMrzCedulaDigital",
      adaptar: aplanarMrz,
    });
  });
});
