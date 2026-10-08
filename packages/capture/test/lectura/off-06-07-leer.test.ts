// OFF-06 (orden y cortocircuitos) y OFF-07 (solo PDF417) con dependencias inyectadas (pwa-lectura-offline, tarea 2.2).
// Datos SINTÉTICOS de @lector-cedula/fixtures (PERSONA_BASE, semilla 1).
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearMrzCedulaDigital, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { describe, expect, it, vi } from "vitest";
import type { CapturaAceptada } from "../../src/index.js";
import { crearLectorCodigosPdf417 } from "../../src/lectura/codigos.js";
import { leerDocumento } from "../../src/lectura/leer.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";
import type { ResultadoLectorMrz } from "../../src/mrz/lector.js";
import type { ResultadoPdf417Imagen } from "../../src/pdf417/decodificar.js";

const FECHA = "2026-10-06";
const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
const M = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
const PIXELES = { data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4 };

function mrzOk(): ResultadoLectorMrz {
  const r = parsearMrzCedulaDigital(M.lineas, { fechaReferencia: FECHA });
  if (!r.ok) throw new Error("fixture MRZ inválido");
  return { ok: true, intento: "proyeccion", digitosValidos: 4, resultado: r } as ResultadoLectorMrz;
}

function deps(pdf417: ResultadoPdf417Imagen, mrz: ResultadoLectorMrz = mrzOk()) {
  const decodificar = vi.fn(async () => pdf417);
  const leerMrz = vi.fn(async () => mrz);
  const d: DependenciasLectura = { decodificar, lectorMrz: { leer: leerMrz }, parsearPdf417: parsearPdf417Amarilla, buscarDivipol };
  return { d, decodificar, leerMrz };
}

describe("OFF-06 Lector de documento con detección automática", () => {
  it("OFF-06 Amarilla sintética", async () => {
    const { d, decodificar, leerMrz } = deps({ ok: true, bytes: new Uint8Array(F.bytes), intento: "original" });
    const r = await leerDocumento(PIXELES, d, { fechaReferencia: FECHA });
    expect(r).toMatchObject({ ok: true, tipo: "pdf417", intento: "original" });
    expect(decodificar).toHaveBeenCalledTimes(1);
    expect(decodificar).toHaveBeenCalledWith(PIXELES);
    expect(leerMrz).toHaveBeenCalledTimes(0);
  });

  it("OFF-06 Digital sintética", async () => {
    const { d, decodificar, leerMrz } = deps({ ok: false, error: "pdf417-no-encontrado" });
    const r = await leerDocumento(PIXELES, d, { fechaReferencia: FECHA });
    expect(r).toMatchObject({ ok: true, tipo: "mrz", intento: "proyeccion" });
    expect(decodificar).toHaveBeenCalledTimes(1);
    expect(leerMrz).toHaveBeenCalledTimes(1);
    expect(leerMrz).toHaveBeenCalledWith(PIXELES, { fechaReferencia: FECHA });
  });

  it("OFF-06 Error de PDF417 distinto de no encontrado", async () => {
    for (const error of ["imagen-ilegible", "entrada-invalida"] as const) {
      const { d, leerMrz } = deps({ ok: false, error });
      expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA })).toStrictEqual({ ok: false, error });
      expect(leerMrz).toHaveBeenCalledTimes(0);
    }
  });

  it("OFF-06 error del lector MRZ se devuelve tal cual", async () => {
    const { d } = deps({ ok: false, error: "pdf417-no-encontrado" }, { ok: false, error: "mrz-no-encontrada" });
    expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA })).toStrictEqual({ ok: false, tipo: "mrz", error: "mrz-no-encontrada" });
  });

  it("OFF-06 MRZ leída con dígitos de control inválidos: mrz-no-valida", async () => {
    const malo = mrzOk();
    if (!malo.ok) throw new Error("x");
    const { d } = deps({ ok: false, error: "pdf417-no-encontrado" }, { ...malo, resultado: { ...malo.resultado, valido: false } });
    expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA })).toStrictEqual({ ok: false, tipo: "mrz", error: "mrz-no-valida" });
  });

  it("OFF-06 PDF417 que el parser rechaza: pdf417-no-valido, sin intentar la MRZ", async () => {
    const { d, leerMrz } = deps({ ok: true, bytes: new Uint8Array([1, 2, 3]), intento: "original" });
    expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA })).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-valido" });
    expect(leerMrz).toHaveBeenCalledTimes(0);
  });

  it("OFF-06 los bytes del PDF417 quedan a cero tras parsear (OFF-11)", async () => {
    const bytes = new Uint8Array(F.bytes);
    const { d } = deps({ ok: true, bytes, intento: "original" });
    await leerDocumento(PIXELES, d, { fechaReferencia: FECHA });
    expect(bytes.every((b) => b === 0)).toBe(true);
    const malos = new Uint8Array([1, 2, 3]);
    await leerDocumento(PIXELES, deps({ ok: true, bytes: malos, intento: "original" }).d, { fechaReferencia: FECHA });
    expect([...malos]).toStrictEqual([0, 0, 0]);
  });

  it("OFF-06 señal abortada antes o entre etapas: cancelada, sin más etapas", async () => {
    const antes = deps({ ok: true, bytes: new Uint8Array(F.bytes), intento: "original" });
    expect(await leerDocumento(PIXELES, antes.d, { fechaReferencia: FECHA, senal: AbortSignal.abort() })).toStrictEqual({ ok: false, error: "cancelada" });
    expect(antes.decodificar).toHaveBeenCalledTimes(0);

    const control = new AbortController();
    const entre = deps({ ok: false, error: "pdf417-no-encontrado" });
    entre.decodificar.mockImplementation(async () => {
      control.abort();
      return { ok: false, error: "pdf417-no-encontrado" };
    });
    expect(await leerDocumento(PIXELES, entre.d, { fechaReferencia: FECHA, senal: control.signal })).toStrictEqual({ ok: false, error: "cancelada" });
    expect(entre.leerMrz).toHaveBeenCalledTimes(0);

    const control2 = new AbortController();
    const tras = deps({ ok: false, error: "pdf417-no-encontrado" });
    tras.leerMrz.mockImplementation(async () => {
      control2.abort();
      return mrzOk();
    });
    expect(await leerDocumento(PIXELES, tras.d, { fechaReferencia: FECHA, senal: control2.signal })).toStrictEqual({ ok: false, error: "cancelada" });
  });
});

function captura(): CapturaAceptada {
  return {
    ancho: 4,
    alto: 4,
    pixeles: PIXELES.data,
    cuadrilatero: [[0, 0], [4, 0], [4, 4], [0, 4]],
    calidad: {} as CapturaAceptada["calidad"],
    liberada: false,
    liberar: () => undefined,
  };
}

describe("OFF-07 Nunca decodificar el QR", () => {
  it("OFF-07 Opciones de zxing", async () => {
    const readBarcodes = vi.fn(async () => [{ bytes: new Uint8Array(F.bytes), isValid: true }]);
    const lector = crearLectorCodigosPdf417({ readBarcodes });
    expect(lector.formatos).toStrictEqual(["pdf417"]);
    const leidos = await lector.leer(captura());
    expect(readBarcodes).toHaveBeenCalled();
    for (const [, opciones] of readBarcodes.mock.calls as unknown as [unknown, { formats: unknown }][]) expect(opciones.formats).toStrictEqual(["PDF417"]);
    expect(leidos).toHaveLength(1);
    expect(leidos[0]).toMatchObject({ formato: "pdf417", esquinas: null });
    expect([...(leidos[0]?.bytes ?? [])]).toStrictEqual([...F.bytes]);
  });

  it("OFF-07 sin código o con señal abortada no devuelve nada", async () => {
    const vacio = crearLectorCodigosPdf417({ readBarcodes: async () => [] });
    expect(await vacio.leer(captura())).toStrictEqual([]);
    const readBarcodes = vi.fn(async () => [{ bytes: new Uint8Array(F.bytes), isValid: true }]);
    expect(await crearLectorCodigosPdf417({ readBarcodes }).leer(captura(), { senal: AbortSignal.abort() })).toStrictEqual([]);
    expect(readBarcodes).toHaveBeenCalledTimes(0);
  });
});

describe("OFF-07 / OFF-11 detalles (mutación)", () => {
  it("el lector de códigos se identifica y lee sin opciones o con opciones sin señal", async () => {
    const lector = crearLectorCodigosPdf417({ readBarcodes: async () => [{ bytes: new Uint8Array(F.bytes), isValid: true }] });
    expect(lector.id).toBe("pdf417-zxing");
    expect(await lector.leer(captura(), {})).toHaveLength(1);
  });

  it("cancelada tras decodificar un PDF417: sus bytes quedan a cero y no se parsea", async () => {
    const control = new AbortController();
    const bytes = new Uint8Array(F.bytes);
    const parsear = vi.fn(parsearPdf417Amarilla);
    const d: DependenciasLectura = {
      ...deps({ ok: true, bytes, intento: "original" }).d,
      parsearPdf417: parsear,
      decodificar: async () => {
        control.abort();
        return { ok: true, bytes, intento: "original" };
      },
    };
    expect(await leerDocumento(PIXELES, d, { fechaReferencia: FECHA, senal: control.signal })).toStrictEqual({ ok: false, error: "cancelada" });
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(parsear).not.toHaveBeenCalled();
  });
});
