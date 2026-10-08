// Tarea 5.1: reductor de pantallas de la PWA (design.md, decisión 8). CAM-02, CAM-05, CAM-09, CAM-10 (transiciones).
import { describe, expect, it } from "vitest";
import { ESTADO_INICIAL, reducir, type Estado } from "../src/estado";

const inicio: Estado = { pantalla: "inicio", aviso: null };
const activo: Estado = { pantalla: "activo", aviso: null };
const pausado: Estado = { pantalla: "pausado", aviso: null };
const listo: Estado = { pantalla: "listo", aviso: null };
const errorPermiso: Estado = { pantalla: "error", codigo: "permiso-denegado", aviso: null };

describe("estado de la PWA", () => {
  it("empieza en inicio sin aviso", () => {
    expect(ESTADO_INICIAL).toStrictEqual(inicio);
  });

  it("CAM-03 Iniciar cámara pasa de inicio a activo", () => {
    expect(reducir(inicio, { tipo: "camara-iniciada" })).toStrictEqual(activo);
  });

  it("CAM-02 entorno no apto lleva a error con su código", () => {
    expect(reducir(inicio, { tipo: "fallo", codigo: "contexto-inseguro" })).toStrictEqual({ pantalla: "error", codigo: "contexto-inseguro", aviso: null });
    expect(reducir(inicio, { tipo: "fallo", codigo: "sin-soporte" })).toStrictEqual({ pantalla: "error", codigo: "sin-soporte", aviso: null });
  });

  it("CAM-05 rechazo de getUserMedia lleva a error y Reintentar vuelve a activo", () => {
    const e = reducir(inicio, { tipo: "fallo", codigo: "permiso-denegado" });
    expect(e).toStrictEqual(errorPermiso);
    expect(reducir(e, { tipo: "camara-iniciada" })).toStrictEqual(activo);
  });

  it("CAM-05 un fallo del Worker en activo da error desconocido", () => {
    expect(reducir(activo, { tipo: "fallo", codigo: "desconocido" })).toStrictEqual({ pantalla: "error", codigo: "desconocido", aviso: null });
  });

  it("CAM-04 el aviso de resolución se guarda en activo y se borra al cancelar", () => {
    const texto = "Tu cámara entrega 1280x720; se necesitan 1920x1080 para leer el código.";
    const conAviso = reducir(activo, { tipo: "aviso", texto });
    expect(conAviso).toStrictEqual({ pantalla: "activo", aviso: texto });
    expect(reducir(conAviso, { tipo: "capturada" })).toStrictEqual({ pantalla: "listo", aviso: texto });
    expect(reducir(conAviso, { tipo: "cancelar" })).toStrictEqual(inicio);
  });

  it("CAL-11 captura aceptada pasa de activo a listo", () => {
    expect(reducir(activo, { tipo: "capturada" })).toStrictEqual(listo);
  });

  it("CAM-10 Cancelar vuelve a inicio desde activo, pausado, listo y error", () => {
    for (const e of [activo, pausado, listo, errorPermiso]) expect(reducir(e, { tipo: "cancelar" })).toStrictEqual(inicio);
  });

  it("CAM-10 página oculta pasa activo a pausado y Continuar vuelve a activo", () => {
    const p = reducir(activo, { tipo: "oculta" });
    expect(p).toStrictEqual(pausado);
    expect(reducir(p, { tipo: "camara-iniciada" })).toStrictEqual(activo);
  });

  it("CAM-10 página oculta en inicio, error o listo no cambia la pantalla", () => {
    for (const e of [inicio, errorPermiso, listo]) expect(reducir(e, { tipo: "oculta" })).toBe(e);
  });

  it("Repetir pasa de listo a activo", () => {
    expect(reducir(listo, { tipo: "camara-iniciada" })).toStrictEqual(activo);
  });

  it("eventos fuera de lugar no cambian el estado", () => {
    expect(reducir(inicio, { tipo: "capturada" })).toBe(inicio);
    expect(reducir(pausado, { tipo: "capturada" })).toBe(pausado);
    expect(reducir(inicio, { tipo: "aviso", texto: "x" })).toBe(inicio);
    expect(reducir(activo, { tipo: "camara-iniciada" })).toBe(activo);
  });
});
