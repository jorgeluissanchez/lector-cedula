// OFF-19 (estados de la máquina de pantallas), OFF-11 (página oculta), OFF-13 y OFF-14 (pwa-lectura-offline, tarea 5.1).
import { describe, expect, it } from "vitest";
import { reducir, type Estado } from "../src/estado";

const listo: Estado = { pantalla: "listo", aviso: null };
const leyendo: Estado = { pantalla: "leyendo", aviso: null };
const activo: Estado = { pantalla: "activo", aviso: null };
const OK = { ok: true, tipo: "pdf417", intento: "original", resultado: { campos: { numeroDocumento: "********56" } } } as const;
const resultado: Estado = { pantalla: "resultado", aviso: null, lectura: OK };
const errorLectura: Estado = { pantalla: "error-lectura", aviso: null, errorLectura: "no-encontrado" };

describe("OFF-19 Lectura automática al llegar a listo", () => {
  it("OFF-19 Estados de la máquina de pantallas", () => {
    expect(reducir(listo, { tipo: "leyendo" })).toStrictEqual(leyendo);
    expect(reducir(leyendo, { tipo: "leida", resultado: OK })).toStrictEqual(resultado);
    expect(reducir(leyendo, { tipo: "leida", resultado: { ok: false, tipo: "mrz", error: "mrz-no-encontrada" } })).toStrictEqual(errorLectura);
    expect(reducir(leyendo, { tipo: "leida", resultado: { ok: false, error: "cancelada" } })).toBe(leyendo);
    for (const e of [leyendo, resultado, errorLectura]) expect(reducir(e, { tipo: "oculta" })).toStrictEqual({ pantalla: "inicio", aviso: null });
  });

  it("OFF-13 cada error se clasifica con su código", () => {
    expect(reducir(leyendo, { tipo: "leida", resultado: { ok: false, tipo: "pdf417", error: "pdf417-no-valido" } })).toStrictEqual({ ...errorLectura, errorLectura: "no-valido" });
    expect(reducir(leyendo, { tipo: "leida", resultado: { ok: false, error: "motor" } })).toStrictEqual({ ...errorLectura, errorLectura: "motor" });
  });

  it("leyendo y leida fuera de lugar no cambian el estado", () => {
    for (const e of [activo, leyendo, resultado, errorLectura]) expect(reducir(e, { tipo: "leyendo" })).toBe(e);
    for (const e of [activo, listo, resultado, errorLectura]) expect(reducir(e, { tipo: "leida", resultado: OK })).toBe(e);
  });

  it("OFF-13 y OFF-14: Intentar de nuevo, Leer otra y Cancelar en leyendo vuelven a activo al arrancar la cámara", () => {
    for (const e of [leyendo, resultado, errorLectura]) expect(reducir(e, { tipo: "camara-iniciada" })).toStrictEqual(activo);
  });

  it("OFF-11 Cancelar desde las pantallas de lectura vuelve a inicio sin resultado", () => {
    for (const e of [leyendo, resultado, errorLectura]) expect(reducir(e, { tipo: "cancelar" })).toStrictEqual({ pantalla: "inicio", aviso: null });
  });
});

describe("OFF-08 fecha de referencia en America/Bogota", () => {
  it("usa la fecha de Bogotá, no la UTC", async () => {
    const { hoyEnBogota } = await import("../src/sesion");
    expect(hoyEnBogota(new Date("2026-10-07T03:00:00Z"))).toBe("2026-10-06");
    expect(hoyEnBogota(new Date("2026-10-07T05:00:00Z"))).toBe("2026-10-07");
  });
});
