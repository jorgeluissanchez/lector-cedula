// OFF-09 Resultado completo en la PWA (pwa-lectura-offline, decisión del usuario del 2026-10-07): `enmascarar: false`
// devuelve los campos sin máscara; por defecto (CLI, servidor) se enmascaran. Datos SINTÉTICOS de PERSONA_BASE.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearMrzCedulaDigital, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { describe, expect, it } from "vitest";
import { leerDocumento } from "../../src/lectura/leer.js";
import { crearManejadorLector } from "../../src/lectura/manejador.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";
import type { ResultadoLectorMrz } from "../../src/mrz/lector.js";
import type { ResultadoPdf417Imagen } from "../../src/pdf417/decodificar.js";

const FECHA = "2026-10-06";
const PIXELES = () => ({ data: new Uint8ClampedArray(64).fill(255), width: 4, height: 4 });

function deps(tipo: "pdf417" | "mrz"): DependenciasLectura {
  const mrz = parsearMrzCedulaDigital(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas, { fechaReferencia: FECHA });
  if (!mrz.ok) throw new Error("fixture MRZ inválido");
  const pdf417: ResultadoPdf417Imagen =
    tipo === "pdf417" ? { ok: true, bytes: new Uint8Array(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes), intento: "original" } : { ok: false, error: "pdf417-no-encontrado" };
  return {
    decodificar: async () => pdf417,
    lectorMrz: { leer: async () => ({ ok: true, intento: "proyeccion", digitosValidos: 4, resultado: mrz }) as ResultadoLectorMrz },
    parsearPdf417: parsearPdf417Amarilla,
    buscarDivipol,
  };
}

const campos = (r: Awaited<ReturnType<typeof leerDocumento>>) => (r.ok ? (r.resultado as { campos: Record<string, unknown> }).campos : null);

describe("OFF-09 Resultado completo en la PWA", () => {
  it("OFF-09 Amarilla sin máscara: número, nombres y apellidos completos", async () => {
    const c = campos(await leerDocumento(PIXELES(), deps("pdf417"), { fechaReferencia: FECHA, enmascarar: false }));
    expect(c).toMatchObject({ numeroDocumento: "9999123456", primerApellido: "PRUEBA", primerNombre: "FICTICIA" });
  });

  it("OFF-09 Digital sin máscara: NUIP, serial y nombres completos", async () => {
    const r = await leerDocumento(PIXELES(), deps("mrz"), { fechaReferencia: FECHA, enmascarar: false });
    expect(campos(r)).toMatchObject({ nuip: "9999123456", serial: "999912345", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ" });
  });

  it("OFF-09 por defecto (CLI y servidor) se enmascara", async () => {
    expect(campos(await leerDocumento(PIXELES(), deps("pdf417"), { fechaReferencia: FECHA }))).toMatchObject({ numeroDocumento: "********56" });
    expect(campos(await leerDocumento(PIXELES(), deps("mrz"), { fechaReferencia: FECHA, enmascarar: true }))).toMatchObject({ nuip: "********56", serial: "*******45" });
  });

  it("OFF-09 el manejador del Worker lector pasa la opción; por defecto enmascara", async () => {
    const mensaje = () => ({ tipo: "leer", id: 1, ancho: 4, alto: 4, pixeles: new Uint8ClampedArray(64).fill(9).buffer, fechaReferencia: FECHA });
    const sin = await crearManejadorLector(deps("mrz"), { enmascarar: false })(mensaje());
    const con = await crearManejadorLector(deps("mrz"))(mensaje());
    expect(sin?.resultado).toMatchObject({ ok: true, resultado: { campos: { nuip: "9999123456" } } });
    expect(con?.resultado).toMatchObject({ ok: true, resultado: { campos: { nuip: "********56" } } });
  });
});
