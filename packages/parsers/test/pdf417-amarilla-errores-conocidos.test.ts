// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
// PA-20: un `it` por error histórico de los repositorios antiguos (skill formato-cedula). Cada prueba se vio
// fallar contra un mutante manual que reintroduce el error (tabla en el informe de la tarea 6.2).
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import { C, P1, P2, P3, P4, P5, P6, S, W, sustituir } from "./ayudas/tramas-referencia.js";

const N = String.fromCharCode(0xd1);

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

describe("PA-20 Regresión de errores conocidos", () => {
  it("PA-20 RH AB no se corta (atrapa: RH con substring(-2) que da B+)", () => {
    expect([exito(parsearPdf417Amarilla(C(P3))).campos.rh, exito(parsearPdf417Amarilla(C(P2))).campos.rh]).toStrictEqual(["AB+", "AB-"]);
  });

  it("PA-20 Sexo F con letras M en nombres (atrapa: sexo por contains(\"M\"))", () => {
    expect(exito(parsearPdf417Amarilla(C(P3))).campos.sexo).toBe("F");
  });

  it("PA-20 Signo negativo conservado (atrapa: normalizador que borra el -)", () => {
    expect([exito(parsearPdf417Amarilla(C(P4))).campos.rh, exito(parsearPdf417Amarilla(W(P4))).campos.rh]).toStrictEqual(["O-", "O-"]);
  });

  it("PA-20 Ñ y acentos no rompen el parser (atrapa: clase [A-Za-z] sin Ñ)", () => {
    for (const trama of [C(P2), W(P2), S(P2)]) {
      const r = parsearPdf417Amarilla(trama);
      expect(r.ok).toBe(true);
      expect(r.ok && [r.campos.primerApellido, r.campos.segundoApellido]).toStrictEqual(["PE" + N + "A", "NU" + N + "EZ"]);
    }
  });

  it("PA-20 Apellidos no invertidos (atrapa: primer y segundo apellido intercambiados)", () => {
    for (const trama of [W(P1), S(P1)]) {
      const r = exito(parsearPdf417Amarilla(trama));
      expect([r.campos.primerApellido, r.campos.segundoApellido]).toStrictEqual(["PEREZ", "GOMEZ"]);
    }
  });

  it("PA-20 Fecha de nacimiento etiquetada como tal (atrapa: clave fechaExpedicion)", () => {
    const r = exito(parsearPdf417Amarilla(C(P1)));
    expect(r.campos.fechaNacimiento).toBe("2000-02-29");
    expect(Object.keys(r.campos).filter((k) => k.toLowerCase().includes("expedicion"))).toStrictEqual([]);
  });

  it("PA-20 Segundo nombre ausente no desplaza campos (atrapa: nombres por posición fija en patrones)", () => {
    for (const trama of [C(P5), W(P5)]) {
      const r = exito(parsearPdf417Amarilla(trama));
      expect([r.campos.segundoNombre, r.campos.sexo, r.campos.fechaNacimiento, r.campos.rh]).toStrictEqual([null, "M", "2004-03-10", "B-"]);
    }
  });

  it("PA-20 Apellido compuesto entero (atrapa: separación por espacio simple)", () => {
    for (const trama of [C(P4), W(P4), S(P4)]) expect(exito(parsearPdf417Amarilla(trama)).campos.primerApellido).toBe("DE LA OSSA");
  });

  it("PA-20 Misma persona en trama completa y truncada (atrapa: offsets absolutos en la trama de Windows)", () => {
    for (const p of [P1, P2, P4, P6]) {
      expect(exito(parsearPdf417Amarilla(W(p))).campos).toStrictEqual(exito(parsearPdf417Amarilla(C(p))).campos);
    }
  });

  it("PA-20 Primer carácter P/A/R no se interpreta (atrapa: aceptar P como indicador de original)", () => {
    expect(parsearPdf417Amarilla(sustituir(C(P1), 150, "P"))).toStrictEqual({ ok: false, error: "bloque-demografico-no-encontrado" });
    expect(Object.keys(exito(parsearPdf417Amarilla(C(P1))).campos).sort()).toStrictEqual([
      "codigoDepartamentoNacimiento",
      "codigoMunicipioNacimiento",
      "fechaNacimiento",
      "numeroDocumento",
      "primerApellido",
      "primerNombre",
      "rh",
      "segundoApellido",
      "segundoNombre",
      "sexo",
    ]);
  });
});
