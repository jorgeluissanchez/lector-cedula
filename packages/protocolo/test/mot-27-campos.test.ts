// MOT-27 (motor-backend-embebido) y SDK-65 (sdk-integracion): `validarEvento` y `protocolo-ndjson.schema.json`
// comprueban los tipos de las claves de `documento.campos` que define `CamposDocumento`, admitiendo claves ausentes y
// adicionales. Datos SINTÉTICOS (NUIP 9999...).
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validarEvento } from "../src/index.js";

const esquema = JSON.parse(readFileSync(new URL("../protocolo-ndjson.schema.json", import.meta.url), "utf8")) as object;
const validarEsquema = new Ajv({ allErrors: true }).compile(esquema);

const evento = (campos: unknown): unknown => ({ etapa: "resultado", ok: true, documento: { tipoDocumento: "cedula-ciudadania", campos, warnings: [] } });

/** Campos de la amarilla sintética (forma de `CamposDocumento`). */
const AMARILLA = {
  numeroDocumento: "9999123456",
  apellidos: "PRUEBA EJEMPLO",
  nombres: "FICTICIA LUZ",
  fechaNacimiento: "1985-03-14",
  sexo: "F",
  nacionalidad: "COL",
  paisEmisor: "COL",
  fechaVencimiento: null,
  nuip: "9999123456",
  rh: "AB-",
  lugarNacimiento: null,
} as const;

function ambos(campos: unknown): [boolean, boolean] {
  return [validarEvento(evento(campos)), validarEsquema(evento(campos)) === true];
}

describe("MOT-27 Tipos de los campos en el protocolo", { timeout: 60_000 }, () => {
  it.each([
    ["sexo", "masculino"],
    ["rh", "C+"],
    ["lugarNacimiento", { codigo: "16001" }],
    ["fechaNacimiento", "17/05/1990"],
    ["nuip", 9999123456],
    ["apellidos", null],
  ])("MOT-27 Tipos de los campos del documento: rechaza %s = %j", (clave, valor) => {
    expect(ambos({ ...AMARILLA, [clave]: valor })).toStrictEqual([false, false]);
  });

  it.each([
    ["vacío", {}],
    ["claves adicionales", { ...AMARILLA, fechaExpedicion: "2020-01-01" }],
    ["amarilla sintética", AMARILLA],
    ["lugar resuelto", { ...AMARILLA, lugarNacimiento: { codigo: "16001", departamento: "BOGOTA D.C", municipio: "BOGOTA, D.C." } }],
    ["digital (sexo X, sin rh ni lugar)", { ...AMARILLA, sexo: "X", rh: undefined, lugarNacimiento: undefined, fechaVencimiento: "2035-03-14" }],
    ["pasaporte (sexo null, sin nuip)", { numeroDocumento: "AZ1234567", apellidos: "PRUEBA", nombres: "LUZ", fechaNacimiento: "1990-02-15", sexo: null, nacionalidad: "D", paisEmisor: "D", fechaVencimiento: "2031-02-14" }],
    ["enmascarado", { ...AMARILLA, numeroDocumento: "********56", nuip: "********56", apellidos: "P***** E******" }],
    ["nulos admitidos", { ...AMARILLA, numeroDocumento: null, nuip: null, nacionalidad: null, fechaNacimiento: null, sexo: null }],
    ["cada RH", { rh: "A+" }],
    ["RH O-", { rh: "O-" }],
    ["sexo M", { sexo: "M" }],
  ])("MOT-27 Tipos de los campos del documento: acepta %s", (_n, campos) => {
    // JSON.stringify quita los `undefined` como en el transporte real.
    expect(ambos(JSON.parse(JSON.stringify(campos)))).toStrictEqual([true, true]);
  });

  it.each([
    ["lugar con clave extra", { ...AMARILLA, lugarNacimiento: { codigo: "16001", departamento: "X", municipio: "Y", pais: "COL" } }],
    ["lugar con código numérico", { ...AMARILLA, lugarNacimiento: { codigo: 16001, departamento: "X", municipio: "Y" } }],
    ["lugar con departamento null", { ...AMARILLA, lugarNacimiento: { codigo: "16001", departamento: null, municipio: "Y" } }],
    ["lugar con municipio numérico", { ...AMARILLA, lugarNacimiento: { codigo: "16001", departamento: "X", municipio: 1 } }],
    ["lugar con dos claves", { ...AMARILLA, lugarNacimiento: { codigo: "16001", departamento: "X" } }],
    ["lugar como texto", { ...AMARILLA, lugarNacimiento: "BOGOTA" }],
    ["lugar como lista", { ...AMARILLA, lugarNacimiento: ["16001", "X", "Y"] }],
    ["fecha con prefijo", { ...AMARILLA, fechaNacimiento: "x1985-03-14" }],
    ["fecha numérica", { ...AMARILLA, fechaNacimiento: 19850314 }],
    ["campos como lista", []],
    ["rh en minúscula", { ...AMARILLA, rh: "ab+" }],
    ["rh null", { ...AMARILLA, rh: null }],
    ["sexo en minúscula", { ...AMARILLA, sexo: "f" }],
    ["fecha con hora", { ...AMARILLA, fechaVencimiento: "2035-03-14T00:00:00Z" }],
    ["paisEmisor null", { ...AMARILLA, paisEmisor: null }],
    ["nacionalidad numérica", { ...AMARILLA, nacionalidad: 170 }],
    ["numeroDocumento numérico", { ...AMARILLA, numeroDocumento: 9999123456 }],
    ["nombres null", { ...AMARILLA, nombres: null }],
  ])("MOT-27 rechaza %s", (_n, campos) => {
    expect(ambos(campos)).toStrictEqual([false, false]);
  });

  it("MOT-27 el validador y el esquema JSON coinciden en campos arbitrarios", () => {
    const valor = fc.oneof(
      fc.constantFrom("M", "F", "X", "m", "A+", "AB-", "O-", "C+", "COL", "", "1985-03-14", "14/03/1985", "9999123456"),
      fc.constantFrom(null, 0, 1.5, true),
      fc.record({ codigo: fc.constantFrom("16001", 16001), departamento: fc.constantFrom("X", null), municipio: fc.constant("Y") }, { requiredKeys: [] }),
      fc.anything(),
    );
    const claves = ["numeroDocumento", "apellidos", "nombres", "fechaNacimiento", "sexo", "nacionalidad", "paisEmisor", "fechaVencimiento", "nuip", "rh", "lugarNacimiento", "otra"] as const;
    let aceptados = 0;
    let total = 0;
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...claves), valor, { maxKeys: 4 }), (campos) => {
        const json: unknown = JSON.parse(JSON.stringify(campos) ?? "{}");
        const [v, e] = ambos(json);
        total++;
        if (v) aceptados++;
        expect(v).toBe(e);
      }),
      { numRuns: 1000 },
    );
    // Ambas ramas ejercitadas: ni todo aceptado ni todo rechazado.
    expect(aceptados).toBeGreaterThan(total * 0.05);
    expect(aceptados).toBeLessThan(total * 0.95);
  });
});
