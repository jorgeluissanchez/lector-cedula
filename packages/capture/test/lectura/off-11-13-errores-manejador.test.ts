// OFF-13 (tabla de errores) y OFF-11 "Bytes a cero" (pwa-lectura-offline, tarea 2.4). Datos SINTÉTICOS.
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { describe, expect, it, vi } from "vitest";
import { clasificarErrorLectura, TEXTOS_ERROR_LECTURA } from "../../src/lectura/errores.js";
import { crearManejadorLector } from "../../src/lectura/manejador.js";
import type { DependenciasLectura } from "../../src/lectura/tipos.js";
import type { ResultadoLectorMrz } from "../../src/mrz/lector.js";

const FECHA = "2026-10-06";

describe("OFF-13 Errores de lectura", () => {
  it("OFF-13 Mapeo de errores", () => {
    expect(clasificarErrorLectura({ ok: false, tipo: "mrz", error: "mrz-no-encontrada" })).toStrictEqual({
      codigo: "no-encontrado",
      texto: "No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos.",
    });
    expect(clasificarErrorLectura({ ok: false, error: "tiempo-agotado" })).toStrictEqual({
      codigo: "tiempo-agotado",
      texto: "La lectura tardó demasiado. Inténtalo de nuevo con mejor luz.",
    });
    for (const r of [{ ok: false, tipo: "pdf417", error: "pdf417-no-valido" }, { ok: false, tipo: "mrz", error: "mrz-no-valida" }]) {
      expect(clasificarErrorLectura(r)).toStrictEqual({ codigo: "no-valido", texto: "Se leyó un código, pero no corresponde a una cédula válida." });
    }
    const motor = { codigo: "motor", texto: "No se pudo iniciar el lector en este dispositivo." };
    for (const r of [{ ok: false, error: "motor" }, { ok: false, tipo: "mrz", error: "modelo-no-disponible" }, undefined, null, "x", 3, {}, { error: 1 }, { ok: false, error: "imagen-ilegible" }, { ok: false, error: "toString" }]) {
      expect(clasificarErrorLectura(r)).toStrictEqual(motor);
    }
  });

  it("OFF-13 la MRZ no encontrada sin haber pasado por el PDF417 (tipo distinto de mrz) es motor", () => {
    expect(clasificarErrorLectura({ ok: false, error: "mrz-no-encontrada" }).codigo).toBe("motor");
  });

  it("OFF-13 textos fijos por código", () => {
    expect(Object.keys(TEXTOS_ERROR_LECTURA).sort()).toStrictEqual(["documento-no-admitido", "menor-de-edad", "motor", "no-encontrado", "no-valido", "ti-mayor-de-edad", "tiempo-agotado"]);
  });
});

function deps(bytes: Uint8Array, leerMrz = vi.fn(async (): Promise<ResultadoLectorMrz> => ({ ok: false, error: "mrz-no-encontrada" }))): DependenciasLectura {
  return { decodificar: async () => ({ ok: true, bytes, intento: "original" }), lectorMrz: { leer: leerMrz }, parsearPdf417: parsearPdf417Amarilla, buscarDivipol };
}

function mensaje(pixeles: ArrayBuffer, id = 1) {
  return { tipo: "leer" as const, id, ancho: 4, alto: 4, pixeles, fechaReferencia: FECHA };
}

describe("OFF-11 Nada persiste (manejador del Worker lector)", () => {
  it("OFF-11 Bytes a cero", async () => {
    const pixeles = new Uint8ClampedArray(4 * 4 * 4).fill(200).buffer;
    const bytes = new Uint8Array(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
    const manejar = crearManejadorLector(deps(bytes));
    const r = await manejar(mensaje(pixeles));
    expect(r).toMatchObject({ tipo: "resultado", id: 1, resultado: { ok: true, tipo: "pdf417" } });
    expect(new Uint8Array(pixeles).every((b) => b === 0)).toBe(true);
    expect(bytes.every((b) => b === 0)).toBe(true);
  });

  it("OFF-11 los píxeles quedan a cero también si la lectura falla o lanza", async () => {
    const pixeles = new Uint8ClampedArray(64).fill(9).buffer;
    const d: DependenciasLectura = { ...deps(new Uint8Array()), decodificar: () => Promise.reject(new Error("wasm")) };
    expect(await crearManejadorLector(d)(mensaje(pixeles, 7))).toStrictEqual({ tipo: "resultado", id: 7, resultado: { ok: false, error: "motor" } });
    expect(new Uint8Array(pixeles).every((b) => b === 0)).toBe(true);
  });

  it("OFF-11 dimensiones incoherentes: entrada-invalida, sin leer y con los bytes a cero", async () => {
    const pixeles = new Uint8ClampedArray(10).fill(9).buffer;
    const decodificar = vi.fn();
    const d: DependenciasLectura = { ...deps(new Uint8Array()), decodificar };
    expect(await crearManejadorLector(d)(mensaje(pixeles, 2))).toStrictEqual({ tipo: "resultado", id: 2, resultado: { ok: false, error: "entrada-invalida" } });
    expect(decodificar).not.toHaveBeenCalled();
    expect(new Uint8Array(pixeles).every((b) => b === 0)).toBe(true);
  });

  it("OFF-14 cancelar aborta la lectura en curso con su id y responde cancelada", async () => {
    let soltar: (() => void) | undefined;
    const d: DependenciasLectura = {
      ...deps(new Uint8Array()),
      decodificar: () => new Promise((r) => (soltar = () => r({ ok: false, error: "pdf417-no-encontrado" }))),
    };
    const leerMrz = vi.fn();
    const manejar = crearManejadorLector({ ...d, lectorMrz: { leer: leerMrz } });
    const pixeles = new Uint8ClampedArray(64).fill(1).buffer;
    const enCurso = manejar(mensaje(pixeles, 5));
    expect(await manejar({ tipo: "cancelar", id: 4 })).toBeNull();
    expect(await manejar({ tipo: "cancelar", id: 5 })).toBeNull();
    soltar?.();
    expect(await enCurso).toStrictEqual({ tipo: "resultado", id: 5, resultado: { ok: false, error: "cancelada" } });
    expect(leerMrz).not.toHaveBeenCalled();
    expect(new Uint8Array(pixeles).every((b) => b === 0)).toBe(true);
  });

  it("OFF-11 mensajes desconocidos se ignoran", async () => {
    const manejar = crearManejadorLector(deps(new Uint8Array()));
    for (const m of [null, undefined, 1, {}, { tipo: "otro" }, { tipo: "leer", id: 1, ancho: 1, alto: 1, pixeles: "x", fechaReferencia: FECHA }]) {
      expect(await manejar(m)).toBeNull();
    }
  });
});

describe("OFF-11 validación del mensaje leer (mutación)", () => {
  const base = () => ({ tipo: "leer", id: 1, ancho: 2, alto: 2, pixeles: new Uint8ClampedArray(16).buffer, fechaReferencia: FECHA });

  it("ignora mensaje leer con algún campo de tipo incorrecto", async () => {
    const decodificar = vi.fn();
    const manejar = crearManejadorLector({ ...deps(new Uint8Array()), decodificar });
    for (const cambio of [{ tipo: "leerx" }, { id: 1.5 }, { ancho: "2" }, { alto: null }, { pixeles: new Uint8Array(16) }, { fechaReferencia: 20261006 }]) {
      expect(await manejar({ ...base(), ...cambio })).toBeNull();
    }
    expect(decodificar).not.toHaveBeenCalled();
  });

  it("rechaza dimensiones nulas o negativas aunque el producto cuadre", async () => {
    const decodificar = vi.fn();
    const manejar = crearManejadorLector({ ...deps(new Uint8Array()), decodificar });
    const casos = [
      { ancho: 0, alto: 2, pixeles: new ArrayBuffer(0) },
      { ancho: 2, alto: 0, pixeles: new ArrayBuffer(0) },
      { ancho: -2, alto: -2, pixeles: new ArrayBuffer(16) },
      { ancho: 2, alto: 2, pixeles: new ArrayBuffer(12) },
    ];
    for (const c of casos) {
      expect(await manejar({ ...base(), ...c })).toStrictEqual({ tipo: "resultado", id: 1, resultado: { ok: false, error: "entrada-invalida" } });
    }
    expect(decodificar).not.toHaveBeenCalled();
  });

  it("pasa a leerDocumento los píxeles con sus dimensiones y la fecha", async () => {
    const decodificar = vi.fn(async () => ({ ok: false as const, error: "imagen-ilegible" as const }));
    const manejar = crearManejadorLector({ ...deps(new Uint8Array()), decodificar });
    expect(await manejar(base())).toStrictEqual({ tipo: "resultado", id: 1, resultado: { ok: false, error: "imagen-ilegible" } });
    expect(decodificar).toHaveBeenCalledWith({ data: expect.any(Uint8ClampedArray), width: 2, height: 2 });
  });
});

describe("OFF-11 Mensaje inválido con píxeles (revisor-privacidad, hallazgo 5)", () => {
  it("OFF-11 responde null y pone a cero el ArrayBuffer de un mensaje leer mal formado", async () => {
    const manejar = crearManejadorLector(deps(new Uint8Array()));
    for (const cambio of [{ id: 1.5 }, { ancho: "2" }, { fechaReferencia: 1 }, { tipo: "leerx" }]) {
      const pixeles = new Uint8ClampedArray(16).fill(7).buffer;
      expect(await manejar({ tipo: "leer", id: 1, ancho: 2, alto: 2, pixeles, fechaReferencia: FECHA, ...cambio })).toBeNull();
      expect(new Uint8Array(pixeles).every((b) => b === 0)).toBe(true);
    }
  });
});
