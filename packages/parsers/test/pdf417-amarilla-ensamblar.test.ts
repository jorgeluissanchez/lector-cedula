// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import { C, C_F, P1, P3, P7, P8, S, S_F, W, insertar, quitar, sustituir, truncar } from "./ayudas/tramas-referencia.js";

const CAMPOS = [
  "numeroDocumento",
  "primerApellido",
  "segundoApellido",
  "primerNombre",
  "segundoNombre",
  "sexo",
  "fechaNacimiento",
  "rh",
  "codigoDepartamentoNacimiento",
  "codigoMunicipioNacimiento",
] as const;
const DIVIPOL = ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"];

const CAMPOS_P1 = {
  numeroDocumento: "9999123456",
  primerApellido: "PEREZ",
  segundoApellido: "GOMEZ",
  primerNombre: "JUAN",
  segundoNombre: "CARLOS",
  sexo: "M",
  fechaNacimiento: "2000-02-29",
  rh: "O+",
  codigoDepartamentoNacimiento: "16",
  codigoMunicipioNacimiento: "001",
};

/** Resultado literal de PA-02 (con `warnings` según PA-19 tras la evidencia de 2026-10-06). */
const RESULTADO_C_P1 = {
  ok: true,
  version: "cc-amarilla",
  fuente: ["pdf417"],
  trama: { variante: "completa", modo: "offsets", bloqueDemografico: "sexo-primero" },
  campos: CAMPOS_P1,
  confianza: {
    numeroDocumento: 1,
    primerApellido: 1,
    segundoApellido: 1,
    primerNombre: 1,
    segundoNombre: 1,
    sexo: 1,
    fechaNacimiento: 1,
    rh: 1,
    codigoDepartamentoNacimiento: 1,
    codigoMunicipioNacimiento: 1,
  },
  validaciones: [
    { id: "formato-nuip", estado: "ok", campos: ["numeroDocumento"], detalle: "nuip" },
    { id: "consistencia-modos", estado: "ok", campos: [], detalle: null },
    { id: "divipol-codigos", estado: "ok", campos: ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"], detalle: null },
    {
      id: "divipol-existe",
      estado: "no-aplica",
      campos: ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"],
      detalle: "sin-resolutor",
    },
  ],
  warnings: [],
};

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

function confianzas(r: ResultadoPdf417Amarilla): number[] {
  return CAMPOS.map((c) => exito(r).confianza[c]);
}

describe("PA-02 Forma del resultado de éxito", () => {
  it("PA-02 Resultado completo de la trama completa de referencia (atrapa: claves, orden de validaciones o valores distintos de la spec)", () => {
    expect(parsearPdf417Amarilla(C(P1))).toStrictEqual(RESULTADO_C_P1);
  });

  it("PA-02 Cada resultado tiene sus propios arreglos (atrapa: estado compartido entre llamadas)", () => {
    const a = exito(parsearPdf417Amarilla(C(P1)));
    a.warnings.push("X99");
    a.validaciones[0].campos.push("rh");
    a.campos.primerApellido = "OTRO";
    expect(parsearPdf417Amarilla(C(P1))).toStrictEqual(RESULTADO_C_P1);
  });
});

describe("PA-17 Confianza por campo", () => {
  it("PA-17 Un solo modo (atrapa: confianza 1 sin corroboración)", () => {
    expect(confianzas(parsearPdf417Amarilla(W(P1)))).toStrictEqual(new Array<number>(10).fill(0.9));
    expect(confianzas(parsearPdf417Amarilla(S(P1)))).toStrictEqual(new Array<number>(10).fill(0.9));
  });

  it("PA-17 Discrepancia entre modos (atrapa: confianza alta cuando los lectores no coinciden)", () => {
    for (const p of [P7, P8]) {
      expect(confianzas(parsearPdf417Amarilla(C(p)))).toStrictEqual([1, 1, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1]);
    }
  });

  it("PA-17 Respaldo por fallo de offsets (atrapa: confianza 1 con un solo lector)", () => {
    expect(confianzas(parsearPdf417Amarilla(insertar(C(P1), 150, [0])))).toStrictEqual(new Array<number>(10).fill(0.9));
  });

  it("PA-17 Nombres por H15 a 0.6 y códigos null a 0 (atrapa: tratar la lectura dudosa como segura)", () => {
    expect(confianzas(parsearPdf417Amarilla(W(P3)))).toStrictEqual([0.9, 0.9, 0.6, 0.6, 0.6, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(confianzas(parsearPdf417Amarilla(S_F(P1)))).toStrictEqual([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0, 0]);
    expect(confianzas(parsearPdf417Amarilla(C_F(P1)))).toStrictEqual([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0, 0]);
  });

  it("PA-17 H15 no rebaja la confianza en modo offsets (atrapa: 0.6 aunque offsets corrobore)", () => {
    expect(confianzas(parsearPdf417Amarilla(C(P3)))).toStrictEqual(new Array<number>(10).fill(1));
  });
});

describe("PA-18 Validaciones", () => {
  it("PA-18 Consistencia fallida (atrapa: ocultar la discrepancia)", () => {
    expect(exito(parsearPdf417Amarilla(C(P7))).validaciones[1]).toStrictEqual({
      id: "consistencia-modos",
      estado: "fallida",
      campos: ["segundoApellido", "primerNombre", "segundoNombre"],
      detalle: null,
    });
  });

  it("PA-18 Consistencia no aplicable (atrapa: comparar sin trama completa o sin offsets)", () => {
    expect(exito(parsearPdf417Amarilla(W(P1))).validaciones[1]).toStrictEqual({
      id: "consistencia-modos",
      estado: "no-aplica",
      campos: [],
      detalle: "trama-no-completa",
    });
    expect(exito(parsearPdf417Amarilla(C_F(P1))).validaciones[1]).toStrictEqual({
      id: "consistencia-modos",
      estado: "no-aplica",
      campos: [],
      detalle: "offsets-sin-resultado",
    });
  });

  it("PA-18 Patrones sin resultado en la trama completa (atrapa: descartar offsets válidos)", () => {
    const r = exito(parsearPdf417Amarilla(sustituir(C(P1), 10, "X")));
    expect(r.trama.modo).toBe("offsets");
    expect(r.campos).toStrictEqual(CAMPOS_P1);
    expect(r.validaciones[1]).toStrictEqual({ id: "consistencia-modos", estado: "no-aplica", campos: [], detalle: "patrones-sin-resultado" });
    expect(confianzas(r)).toStrictEqual(new Array<number>(10).fill(0.9));
  });

  it("PA-18 Cuatro validaciones en orden y divipol-existe por precedencia (atrapa: validaciones ausentes o reordenadas)", () => {
    const sinCodigos = exito(parsearPdf417Amarilla(C_F(P1)));
    expect(sinCodigos.validaciones.map((v) => v.id)).toStrictEqual(["formato-nuip", "consistencia-modos", "divipol-codigos", "divipol-existe"]);
    expect(sinCodigos.validaciones[3]).toStrictEqual({ id: "divipol-existe", estado: "no-aplica", campos: DIVIPOL, detalle: "sin-codigos" });
    expect(exito(parsearPdf417Amarilla(W(P1))).validaciones[3]).toStrictEqual({
      id: "divipol-existe",
      estado: "no-aplica",
      campos: DIVIPOL,
      detalle: "sin-resolutor",
    });
    expect(exito(parsearPdf417Amarilla(C(P1, "0M2000022916001O+"))).validaciones[3]?.detalle).toBe("sin-codigos");
  });
});

describe("PA-19 Hipótesis aplicadas en warnings", () => {
  it("PA-19 Warnings por camino (atrapa: hipótesis confirmadas o pendientes omitidas en la salida)", () => {
    const tramas = [C(P1), W(P1), S(P1), W(P3), S_F(P1), C(P1, "0M2000022916001O+")];
    expect(tramas.map((t) => exito(parsearPdf417Amarilla(t)).warnings)).toStrictEqual([
      [],
      ["H02"],
      ["H07"],
      ["H02", "H15"],
      ["H07", "H08"],
      [],
    ]);
  });

  it("PA-19 H15 solo cuando el resultado sale de patrones (atrapa: H15 en modo offsets)", () => {
    expect(exito(parsearPdf417Amarilla(C(P3))).warnings).toStrictEqual([]);
    expect(exito(parsearPdf417Amarilla(C(P7))).warnings).toStrictEqual([]);
    expect(exito(parsearPdf417Amarilla(insertar(C(P3), 150, [0]))).warnings).toStrictEqual(["H15"]);
    expect(exito(parsearPdf417Amarilla(C_F(P1))).warnings).toStrictEqual(["H08"]);
  });

  it("PA-19 Marcador pegado a la cabecera aplica H02 (atrapa: tratar una trama truncada como completa)", () => {
    expect(exito(parsearPdf417Amarilla(quitar(C(P1), 10, 24))).warnings).toStrictEqual(["H02"]);
    expect(exito(parsearPdf417Amarilla(truncar(C_F(P3)))).warnings).toStrictEqual(["H02", "H08", "H15"]);
  });

  it("PA-19 Un error no incluye warnings (atrapa: claves extra en el error)", () => {
    expect(parsearPdf417Amarilla(sustituir(C(P1), 152, "20000230"))).toStrictEqual({ ok: false, error: "fecha-nacimiento-invalida" });
  });
});
