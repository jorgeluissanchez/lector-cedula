// OFF-24: solo cédulas de ciudadanía de mayores de edad (hallazgo menor 2 del revisor-privacidad, tarea 9.1).
// Datos SINTÉTICOS de @lector-cedula/fixtures (PERSONA_BASE con otra fecha de nacimiento).
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearMrzCedulaDigital, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { describe, expect, it, vi } from "vitest";
import { esMayorDeEdad } from "../../src/lectura/edad.js";
import { clasificarErrorLectura } from "../../src/lectura/errores.js";
import { leerDocumento } from "../../src/lectura/leer.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";
import type { ResultadoLectorMrz } from "../../src/mrz/lector.js";

const FECHA = "2026-10-06";
const PIXELES = { data: new Uint8ClampedArray(64).fill(255), width: 4, height: 4 };

function depsPdf417(bytes: Uint8Array): DependenciasLectura {
  return {
    decodificar: vi.fn(async () => ({ ok: true as const, bytes, intento: "original" })),
    lectorMrz: { leer: vi.fn(async (): Promise<ResultadoLectorMrz> => ({ ok: false, error: "mrz-no-encontrada" })) },
    parsearPdf417: parsearPdf417Amarilla,
    buscarDivipol,
  };
}

function depsMrz(fechaNacimiento: string): DependenciasLectura {
  const r = parsearMrzCedulaDigital(generarMrzTd1({ ...PERSONA_BASE, fechaNacimiento }, { semilla: 1 }).lineas, { fechaReferencia: FECHA });
  if (!r.ok) throw new Error("fixture MRZ inválido");
  return {
    decodificar: vi.fn(async () => ({ ok: false as const, error: "pdf417-no-encontrado" as const })),
    lectorMrz: { leer: vi.fn(async () => ({ ok: true, intento: "proyeccion", digitosValidos: 4, resultado: r }) as ResultadoLectorMrz) },
    parsearPdf417: parsearPdf417Amarilla,
    buscarDivipol,
  };
}

const leerAmarilla = (fechaNacimiento: string, bytes = new Uint8Array(generarPdf417({ ...PERSONA_BASE, fechaNacimiento }, { semilla: 1 }).bytes)) =>
  leerDocumento(PIXELES, depsPdf417(bytes), { fechaReferencia: FECHA });

describe("OFF-24 Solo cédulas de ciudadanía de mayores de edad", () => {
  it("OFF-24 Exactamente 18 años: amarilla y digital se leen", async () => {
    expect(await leerAmarilla("2008-10-06")).toMatchObject({ ok: true, tipo: "pdf417" });
    expect(await leerDocumento(PIXELES, depsMrz("2008-10-06"), { fechaReferencia: FECHA })).toMatchObject({ ok: true, tipo: "mrz" });
  });

  it("OFF-24 Un día menos de 18 años: menor-de-edad sin campos y bytes a cero", async () => {
    const bytes = new Uint8Array(generarPdf417({ ...PERSONA_BASE, fechaNacimiento: "2008-10-07" }, { semilla: 1 }).bytes);
    expect(await leerAmarilla("2008-10-07", bytes)).toStrictEqual({ ok: false, tipo: "pdf417", error: "menor-de-edad" });
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(await leerDocumento(PIXELES, depsMrz("2008-10-07"), { fechaReferencia: FECHA })).toStrictEqual({ ok: false, tipo: "mrz", error: "menor-de-edad" });
  });

  it("OFF-24 Tarjeta de identidad en PDF417 (layout de la amarilla, H10): 12 años se rechaza", async () => {
    expect(await leerAmarilla("2014-05-20")).toStrictEqual({ ok: false, tipo: "pdf417", error: "menor-de-edad" });
  });

  it("OFF-24 regla de edad: bordes de día, mes, año y 29 de febrero", () => {
    expect(esMayorDeEdad("2008-10-06", "2026-10-06")).toBe(true);
    expect(esMayorDeEdad("2008-10-07", "2026-10-06")).toBe(false);
    expect(esMayorDeEdad("2008-11-01", "2026-10-31")).toBe(false);
    expect(esMayorDeEdad("2008-09-30", "2026-10-01")).toBe(true);
    expect(esMayorDeEdad("2007-12-31", "2026-01-01")).toBe(true);
    expect(esMayorDeEdad("2009-01-01", "2026-12-31")).toBe(false);
    expect(esMayorDeEdad("2008-02-29", "2026-02-28")).toBe(false);
    expect(esMayorDeEdad("2008-02-29", "2026-03-01")).toBe(true);
    expect(esMayorDeEdad("1985-03-14", "2026-10-06")).toBe(true);
  });

  it("OFF-13 menor-de-edad tiene código y texto propios", () => {
    expect(clasificarErrorLectura({ ok: false, tipo: "pdf417", error: "menor-de-edad" })).toStrictEqual({
      codigo: "menor-de-edad",
      texto: "Este lector solo admite cédulas de ciudadanía de mayores de edad.",
    });
  });
});
