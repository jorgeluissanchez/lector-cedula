// OFF-09 y OFF-18 (pwa-lectura-offline, tarea 5.1): campos visibles del resultado enmascarado, con etiqueta.
import { describe, expect, it } from "vitest";
import { camposVisibles } from "../src/resultado";

describe("OFF-09 campos de la pantalla de resultado", () => {
  it("OFF-09 amarilla: etiquetas fijas, valores enmascarados tal cual y lugar de nacimiento legible", () => {
    const campos = {
      numeroDocumento: "********56",
      primerApellido: "P*****",
      segundoApellido: "E******",
      primerNombre: "F*******",
      segundoNombre: null,
      sexo: "F",
      fechaNacimiento: "1990-01-02",
      rh: "AB+",
      codigoDepartamentoNacimiento: "16",
      lugarNacimiento: { codigo: "16001", departamento: "DEPTO", municipio: "MUNI" },
    };
    expect(camposVisibles({ ok: true, tipo: "pdf417", intento: "original", resultado: { campos } })).toStrictEqual([
      { clave: "numeroDocumento", etiqueta: "Número de documento", valor: "********56" },
      { clave: "primerApellido", etiqueta: "Primer apellido", valor: "P*****" },
      { clave: "segundoApellido", etiqueta: "Segundo apellido", valor: "E******" },
      { clave: "primerNombre", etiqueta: "Primer nombre", valor: "F*******" },
      { clave: "sexo", etiqueta: "Sexo", valor: "F" },
      { clave: "fechaNacimiento", etiqueta: "Fecha de nacimiento", valor: "1990-01-02" },
      { clave: "rh", etiqueta: "RH", valor: "AB+" },
      { clave: "lugarNacimiento", etiqueta: "Lugar de nacimiento", valor: "MUNI, DEPTO" },
    ]);
  });

  it("OFF-09 amarilla con lugar no resuelto", () => {
    const r = camposVisibles({ ok: true, tipo: "pdf417", intento: "original", resultado: { campos: { numeroDocumento: "**34", lugarNacimiento: null } } });
    expect(r).toStrictEqual([
      { clave: "numeroDocumento", etiqueta: "Número de documento", valor: "**34" },
      { clave: "lugarNacimiento", etiqueta: "Lugar de nacimiento", valor: "No resuelto" },
    ]);
  });

  it("OFF-09 digital: número de documento, serial y nombres enmascarados; sin líneas MRZ", () => {
    const campos = { nuip: "********56", serial: "*******45", apellidos: "P***** E******", nombres: "F******* L**", sexo: "F", fechaNacimiento: "1990-01-02", fechaVencimiento: "2034-01-02", nacionalidad: "COL", nuipTipoProbable: "nuip" };
    expect(camposVisibles({ ok: true, tipo: "mrz", intento: "proyeccion", resultado: { campos, lineasCorregidas: null } }).map((c) => [c.etiqueta, c.valor])).toStrictEqual([
      ["Número de documento", "********56"],
      ["Serial", "*******45"],
      ["Apellidos", "P***** E******"],
      ["Nombres", "F******* L**"],
      ["Sexo", "F"],
      ["Fecha de nacimiento", "1990-01-02"],
      ["Fecha de vencimiento", "2034-01-02"],
      ["Nacionalidad", "COL"],
    ]);
  });

  it("resultado sin campos: lista vacía", () => {
    expect(camposVisibles({ ok: true, tipo: "mrz", intento: "x", resultado: null })).toStrictEqual([]);
  });
});
