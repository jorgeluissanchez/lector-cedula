// Cambio otros-documentos, capacidad cedula-extranjeria: OD-10, OD-10a y OD-10b con los literales de la spec.
import { describe, expect, it } from "vitest";
import { parsearMrzCedulaDigital, parsearMrzTd1 } from "../src/index.js";
import { CE_SINTETICA, DATOS_CE, ESPECIMEN_ICAO, generarTd1 } from "./ayudas/generador-mrz-icao.js";

const REF = { fechaReferencia: "2026-10-08" };
const VALIDOS = { numeroDocumento: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" };

function exito(r: ReturnType<typeof parsearMrzTd1>) {
  if (!r.ok) throw new Error(`se esperaba ok: ${JSON.stringify(r)}`);
  return r;
}

describe("OD-10a Controles del TD1", () => {
  it("CE sintética", () => {
    const r = exito(parsearMrzTd1(CE_SINTETICA, REF));
    expect(r.campos).toStrictEqual({
      codigoDocumento: "I",
      estadoEmisor: "COL",
      numeroDocumento: "1234567",
      datoOpcional1: null,
      fechaNacimiento: "1980-01-01",
      sexo: "F",
      fechaVencimiento: "2030-01-01",
      nacionalidad: "VEN",
      datoOpcional2: null,
      apellidos: "GARCIA",
      nombres: "MARIA JOSE",
    });
    expect(r.nombreNacionalidad).toBe("Venezuela");
    expect(r.nombrePaisEmisor).toBe("Colombia");
    expect(r.digitosControl).toStrictEqual(VALIDOS);
    expect(r.correcciones).toStrictEqual([]);
    expect(r.warnings).toStrictEqual([]);
  });

  it("compuesto alterado", () => {
    const l2 = CE_SINTETICA[1].slice(0, 29) + "5";
    expect(parsearMrzTd1([CE_SINTETICA[0], l2, CE_SINTETICA[2]], REF)).toStrictEqual({
      ok: false,
      error: "digito-control",
      digitosControl: { ...VALIDOS, compuesto: "invalido" },
    });
  });

  it.each([
    ["numeroDocumento", 0, 14],
    ["nacimiento", 1, 6],
    ["vencimiento", 1, 14],
  ])("%s alterado", (clave, linea, pos) => {
    const lineas = [...CE_SINTETICA];
    const l = lineas[linea] as string;
    lineas[linea] = l.slice(0, pos) + (l.charAt(pos) === "9" ? "8" : "9") + l.slice(pos + 1);
    expect(parsearMrzTd1(lineas, REF)).toMatchObject({ ok: false, error: "digito-control", digitosControl: { [clave]: "invalido" } });
  });

  it("corrige OCR-B solo en zonas numéricas y registra la línea", () => {
    const [l1, l2, l3] = CE_SINTETICA;
    const r = exito(parsearMrzTd1([l1, "8OO1014F3001019VEN<<<<<<<<<<<4", l3], REF));
    expect(r.campos.fechaNacimiento).toBe("1980-01-01");
    expect(r.correcciones).toStrictEqual([
      { linea: 2, posicion: 1, de: "O", a: "0" },
      { linea: 2, posicion: 2, de: "O", a: "0" },
    ]);
    const conI = exito(parsearMrzTd1([l1, l2.slice(0, 8) + "3OO1O19" + l2.slice(15), l3], REF));
    expect(conI.correcciones.map((c) => c.posicion)).toStrictEqual([9, 10, 12]);
  });

  it("corrige el dígito de control del número [14] y el compuesto [29]", () => {
    const [l1, l2, l3] = generarTd1({ ...DATOS_CE, numero: "1234560" });
    const letra: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B" };
    const c14 = l1.charAt(14);
    const c29 = l2.charAt(29);
    const n1 = letra[c14] === undefined ? l1 : l1.slice(0, 14) + letra[c14] + l1.slice(15);
    const n2 = letra[c29] === undefined ? l2 : l2.slice(0, 29) + letra[c29];
    expect(n1).not.toBe(l1);
    expect(n2).not.toBe(l2);
    const r = exito(parsearMrzTd1([n1, n2, l3], REF));
    expect(r.correcciones).toStrictEqual([
      { linea: 1, posicion: 14, de: letra[c14], a: c14 },
      { linea: 2, posicion: 29, de: letra[c29], a: c29 },
    ]);
  });

  it("no corrige número, países, opcionales ni nombres", () => {
    const r = exito(parsearMrzTd1(generarTd1({ ...DATOS_CE, numero: "AO12", opcional1: "OZ", opcional2: "SB", nacionalidad: "BOL", apellidos: "OSSO" }), REF));
    expect(r.campos).toMatchObject({ numeroDocumento: "AO12", datoOpcional1: "OZ", datoOpcional2: "SB", nacionalidad: "BOL", apellidos: "OSSO" });
    expect(r.correcciones).toStrictEqual([]);
  });

  it("la digital no cambia", () => {
    const digital = ["ICCOL999900123816001<<<<<<<<<<", "9007150F3407150COL9999123456<5", "FICTICIO<EJEMPLO<<ANA<MARIA<<<"];
    const antes = parsearMrzCedulaDigital(digital, { fechaReferencia: "2026-10-06" });
    parsearMrzTd1(digital, REF);
    expect(parsearMrzCedulaDigital(digital, { fechaReferencia: "2026-10-06" })).toStrictEqual(antes);
    expect(antes).toMatchObject({ ok: true, valido: true, campos: { serial: "999900123", nuip: "9999123456" }, warnings: ["M03"] });
  });

  it("sexo, siglo, vencido y país desconocido", () => {
    const r = exito(parsearMrzTd1(generarTd1({ ...DATOS_CE, sexo: "<", nacimiento: "261009", vencimiento: "261007", nacionalidad: "QQQ" }), REF));
    expect(r.campos.sexo).toBeNull();
    expect(r.campos.fechaNacimiento).toBe("1926-10-09");
    expect(r.warnings).toStrictEqual(["documento-vencido", "pais-desconocido"]);
    expect(exito(parsearMrzTd1(generarTd1({ ...DATOS_CE, sexo: "M" }), REF)).campos.sexo).toBe("M");
  });

  it("número con relleno intermedio y opcionales con datos", () => {
    const r = exito(parsearMrzTd1(generarTd1({ ...DATOS_CE, numero: "0012345", opcional1: "12345", opcional2: "9999" }), REF));
    expect(r.campos.numeroDocumento).toBe("0012345");
    expect(r.campos.datoOpcional1).toBe("12345");
    expect(r.campos.datoOpcional2).toBe("9999");
  });
});

describe("OD-10b Forma del resultado del TD1", () => {
  it.each([
    ["dos líneas del espécimen", ESPECIMEN_ICAO],
    ["null", null],
    ["línea de 29", [CE_SINTETICA[0], CE_SINTETICA[1].slice(0, 29), CE_SINTETICA[2]]],
    ["minúsculas", [CE_SINTETICA[0], CE_SINTETICA[1], CE_SINTETICA[2].toLowerCase()]],
    ["no strings", [1, 2, 3]],
    ["cuatro líneas", [...CE_SINTETICA, CE_SINTETICA[0]]],
  ])("formato-td1: %s", (_n, entrada) => {
    expect(parsearMrzTd1(entrada, REF)).toStrictEqual({ ok: false, error: "formato-td1" });
  });

  it("fecha imposible", () => {
    expect(parsearMrzTd1(generarTd1({ ...DATOS_CE, nacimiento: "800230" }), REF)).toStrictEqual({ ok: false, error: "fecha-invalida" });
    expect(parsearMrzTd1(generarTd1({ ...DATOS_CE, vencimiento: "301301" }), REF)).toStrictEqual({ ok: false, error: "fecha-invalida" });
  });

  it("fecha de referencia inválida y ausente", () => {
    expect(parsearMrzTd1(CE_SINTETICA, { fechaReferencia: "2026-02-30" })).toStrictEqual({ ok: false, error: "fecha-referencia-invalida" });
    expect(exito(parsearMrzTd1(CE_SINTETICA)).campos.fechaNacimiento).toBe("1980-01-01");
  });
});
