// OFF-08 lugar de nacimiento con DIVIPOL en `leerDocumento` (pwa-lectura-offline, tarea 2.3). Rápida y sin procesos
// (la mutación la ejecuta; el diferencial contra la CLI vive en off-08-diferencial.test.ts). Datos SINTÉTICOS.
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { describe, expect, it, vi } from "vitest";
import { conLugarNacimiento } from "../../src/lectura/lugar.js";
import { leerDocumento } from "../../src/lectura/leer.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";

const FECHA = "2026-10-06";
const deps: DependenciasLectura = {
  decodificar: async () => ({ ok: false, error: "imagen-ilegible" }),
  lectorMrz: { leer: async () => ({ ok: false, error: "mrz-no-encontrada" }) },
  parsearPdf417: parsearPdf417Amarilla,
  buscarDivipol,
};

describe("OFF-08 Parseo y DIVIPOL en el dispositivo (lugar)", () => {
  it("OFF-08 resuelve el lugar de nacimiento de PERSONA_BASE (16001) sin máscara", async () => {
    const bytes = new Uint8Array(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
    const d = { ...deps, decodificar: async () => ({ ok: true as const, bytes, intento: "original" as const }) };
    const r = await leerDocumento({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, d, { fechaReferencia: FECHA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { campos, warnings } = r.resultado as { campos: { lugarNacimiento: unknown }; warnings?: string[] };
    expect(campos.lugarNacimiento).toStrictEqual({ codigo: "16001", departamento: expect.any(String), municipio: expect.any(String) });
    expect(warnings ?? []).not.toContain("lugar-nacimiento-no-resuelto");
  });

  it("OFF-08 Lugar desconocido", async () => {
    const bytes = new Uint8Array(generarPdf417({ ...PERSONA_BASE, departamento: "99", municipio: "999" }, { semilla: 1 }).bytes);
    const d = { ...deps, decodificar: async () => ({ ok: true as const, bytes, intento: "original" as const }) };
    const r = await leerDocumento({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, d, { fechaReferencia: FECHA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const resultado = r.resultado as { campos: { lugarNacimiento: unknown }; warnings: string[] };
    expect(resultado.campos.lugarNacimiento).toBeNull();
    expect(resultado.warnings).toContain("lugar-nacimiento-no-resuelto");
  });
});

describe("OFF-08 lugar sin códigos de nacimiento (mutación)", () => {
  it("sin códigos o con uno solo: null, aviso añadido a los existentes y sin consultar DIVIPOL", () => {
    const buscar = vi.fn(buscarDivipol);
    for (const campos of [{}, { codigoDepartamentoNacimiento: "16" }, { codigoMunicipioNacimiento: "001" }]) {
      const r = conLugarNacimiento({ campos, warnings: ["previo"] }, buscar);
      expect(r).toStrictEqual({ campos: { ...campos, lugarNacimiento: null }, warnings: ["previo", "lugar-nacimiento-no-resuelto"] });
    }
    expect(buscar).not.toHaveBeenCalled();
    expect(conLugarNacimiento({ campos: {} }, buscar).warnings).toStrictEqual(["lugar-nacimiento-no-resuelto"]);
  });

  it("resuelto: no añade avisos y consulta DIVIPOL con departamento + municipio", () => {
    const buscar = vi.fn(buscarDivipol);
    const r = conLugarNacimiento({ campos: { codigoDepartamentoNacimiento: "16", codigoMunicipioNacimiento: "001" } }, buscar);
    expect(buscar).toHaveBeenCalledWith("16001");
    expect(r.warnings).toBeUndefined();
  });

  it("leerDocumento pasa DIVIPOL al parser del PDF417", async () => {
    const bytes = new Uint8Array(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
    const parsear = vi.fn(parsearPdf417Amarilla);
    await leerDocumento({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, { ...deps, parsearPdf417: parsear, decodificar: async () => ({ ok: true, bytes, intento: "original" }) }, { fechaReferencia: FECHA });
    expect(parsear).toHaveBeenCalledWith(expect.any(Uint8Array), { divipol: buscarDivipol });
  });
});
