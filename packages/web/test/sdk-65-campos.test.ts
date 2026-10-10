// SDK-65 "La salida real cumple el protocolo" y "Propiedad de la salida real" (sdk-integracion), con MOT-27
// (motor-backend-embebido): los `campos` que producen los parsers reales a través de `interpretarPdf417` e
// `interpretarMrz` de @lector-cedula/capture (los mismos que usan leerDocumento, el motor y el núcleo nativo) cumplen el
// validador y el esquema JSON del protocolo, y sus valores están en el dominio de los tipos públicos.
// fixture-sintetico: PERSONA_BASE (NUIP 9999123456) y generadores sintéticos; nunca datos reales.
import { arbFixtureMrz, arbFixturePdf417, generarMrzTd1, generarPdf417, PERSONA_BASE } from "@lector-cedula/fixtures";
import Ajv from "ajv";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretarLineasMrz, interpretarMrz, interpretarPdf417, type OpcionesLectura, type ResultadoLectura } from "../../capture/src/index.js";
import { buscarDivipol, parsearPdf417Amarilla } from "../../parsers/src/index.js";
import { arbDatosTd1, arbDatosTd3, CE_SINTETICA, generarTd1, generarTd3, PASAPORTE_COL } from "../../parsers/test/ayudas/generador-mrz-icao.js";
import { validarEvento } from "../../protocolo/src/index.js";

const REF = "2026-10-10";
const DEPS = { parsearPdf417: parsearPdf417Amarilla, buscarDivipol };
const esquema = JSON.parse(readFileSync(new URL("../../protocolo/protocolo-ndjson.schema.json", import.meta.url), "utf8")) as object;
const validarEsquema = new Ajv({ allErrors: true }).compile(esquema);

const SEXOS = ["M", "F", "X", null];
const RH = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const FECHA_ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const CLAVES = ["numeroDocumento", "apellidos", "nombres", "fechaNacimiento", "sexo", "nacionalidad", "paisEmisor", "fechaVencimiento", "nuip", "rh", "lugarNacimiento"];

type Correcta = Extract<ResultadoLectura, { ok: true }>;

function final(paso: ReturnType<typeof interpretarPdf417>): ResultadoLectura {
  return "final" in paso ? paso.final : "noEncontrado" in paso ? paso.noEncontrado : paso.soloCe;
}

const pdf417 = (bytes: Uint8Array, o: Partial<OpcionesLectura> = {}): ResultadoLectura =>
  final(interpretarPdf417(new Uint8Array(bytes), "sintetico", DEPS, { fechaReferencia: REF, ...o }));

const mrz = (lineas: readonly string[], o: Partial<OpcionesLectura> = {}): ResultadoLectura =>
  final(interpretarMrz(interpretarLineasMrz([...lineas], lineas.length === 2 ? "td3" : "td1", REF, "sintetico" as never), { fechaReferencia: REF, ...o }));

/** Envuelve la lectura en el evento final del protocolo como lo emite el servidor (JSON de ida y vuelta). */
function comprobarProtocolo(r: Correcta): void {
  const evento = JSON.parse(JSON.stringify({ etapa: "resultado", ok: true, documento: { tipoDocumento: r.tipoDocumento, campos: r.campos, warnings: r.warnings } })) as unknown;
  expect(validarEvento(evento)).toBe(true);
  expect(validarEsquema(evento), JSON.stringify(validarEsquema.errors)).toBe(true);
}

/** Oráculo independiente del validador: dominio literal de SDK-65. */
function comprobarDominio(r: Correcta): void {
  const c = r.campos as unknown as Record<string, unknown>;
  for (const clave of Object.keys(c)) expect(CLAVES).toContain(clave);
  expect(SEXOS).toContain(c.sexo);
  for (const f of [c.fechaNacimiento, c.fechaVencimiento]) if (f !== null) expect(f).toMatch(FECHA_ISO);
  if ("rh" in c) expect(RH).toContain(c.rh);
  if ("lugarNacimiento" in c && c.lugarNacimiento !== null) {
    expect(Object.keys(c.lugarNacimiento as object).sort()).toStrictEqual(["codigo", "departamento", "municipio"]);
  }
}

function correcta(r: ResultadoLectura): Correcta {
  if (!r.ok) throw new Error(`lectura sintética fallida: ${r.error}`);
  return r;
}

const AMARILLA = generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes;
const TI = generarPdf417({ ...PERSONA_BASE, fechaNacimiento: "2016-03-14" }, { semilla: 1 }).bytes;
const DIGITAL = generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas;

describe("SDK-65 Tipos públicos de los campos", { timeout: 60_000 }, () => {
  it.each([true, false])("SDK-65 La salida real cumple el protocolo (enmascarar: %s)", (enmascarar) => {
    const lecturas = {
      amarilla: correcta(pdf417(AMARILLA, { enmascarar })),
      ti: correcta(pdf417(TI, { enmascarar, admitirTarjetaIdentidad: true })),
      digital: correcta(mrz(DIGITAL, { enmascarar })),
      ce: correcta(mrz(CE_SINTETICA, { enmascarar })),
      pasaporte: correcta(mrz(PASAPORTE_COL, { enmascarar })),
    };
    expect(Object.fromEntries(Object.entries(lecturas).map(([k, r]) => [k, r.tipoDocumento]))).toStrictEqual({
      amarilla: "cedula-ciudadania",
      ti: "tarjeta-identidad",
      digital: "cedula-ciudadania",
      ce: "cedula-extranjeria",
      pasaporte: "pasaporte",
    });
    for (const r of Object.values(lecturas)) {
      comprobarProtocolo(r);
      comprobarDominio(r);
    }
    const a = lecturas.amarilla.campos;
    expect(a.lugarNacimiento).toStrictEqual({ codigo: "16001", departamento: expect.any(String), municipio: expect.any(String) });
    expect(a.nuip).toBe(enmascarar ? "********56" : "9999123456");
    expect([a.sexo, a.rh, a.fechaNacimiento, a.fechaVencimiento]).toStrictEqual([PERSONA_BASE.sexo, PERSONA_BASE.rh, PERSONA_BASE.fechaNacimiento, null]);
    expect(lecturas.ti.campos.rh).toBe(PERSONA_BASE.rh);
    // CE y pasaporte no traen nuip, rh ni lugar; la digital trae nuip y fecha de vencimiento.
    for (const r of [lecturas.ce, lecturas.pasaporte]) for (const k of ["nuip", "rh", "lugarNacimiento"]) expect(r.campos).not.toHaveProperty(k);
    expect(lecturas.digital.campos).not.toHaveProperty("rh");
    expect(lecturas.digital.campos.fechaVencimiento).toBe(PERSONA_BASE.fechaVencimiento);
  });

  it("SDK-65 lugar no resuelto: lugarNacimiento null cumple el protocolo", () => {
    const r = correcta(pdf417(generarPdf417({ ...PERSONA_BASE, departamento: "16", municipio: "999" }, { semilla: 1 }).bytes));
    expect(r.campos.lugarNacimiento).toBeNull();
    expect(r.warnings).toContain("lugar-nacimiento-no-resuelto");
    comprobarProtocolo(r);
  });

  it("SDK-65 Propiedad de la salida real", () => {
    type Leer = (o: Partial<OpcionesLectura>) => ResultadoLectura;
    const fuentes: Record<string, fc.Arbitrary<Leer>> = {
      pdf417: arbFixturePdf417().map((f) => (o: Partial<OpcionesLectura>) => pdf417(f.bytes, o)),
      digital: arbFixtureMrz({ variantes: ["valida"] }).map((f) => (o: Partial<OpcionesLectura>) => mrz(f.lineas, o)),
      // CE válida por construcción (OD-10a): emisor COL, código I/ID/IE y nacionalidad extranjera.
      td1: fc
        .tuple(arbDatosTd1(), fc.constantFrom("I", "ID", "IE"), fc.constantFrom("VEN", "ESP", "USA", "D", "ECU", "PER"))
        .map(([d, codigo, nacionalidad]) => (o: Partial<OpcionesLectura>) => mrz(generarTd1({ ...d, emisor: "COL", codigo, nacionalidad }), o)),
      td3: arbDatosTd3().map((d) => (o: Partial<OpcionesLectura>) => mrz(generarTd3(d), o)),
    };
    for (const [fuente, arb] of Object.entries(fuentes)) {
      let utiles = 0;
      let total = 0;
      fc.assert(
        fc.property(arb, fc.boolean(), (leer, enmascarar) => {
          total++;
          const r = leer({ enmascarar, admitirTarjetaIdentidad: true });
          if (!r.ok) return;
          utiles++;
          comprobarProtocolo(r);
          comprobarDominio(r);
        }),
        { numRuns: 300 },
      );
      expect({ fuente, util: utiles / total > 0.5 }).toStrictEqual({ fuente, util: true });
    }
  });
});
