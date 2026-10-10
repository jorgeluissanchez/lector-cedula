// Decisión del orquestador 1 (design.md): motor en @lector-cedula/motor como peerDependency opcional; sin él,
// crearLectorServidor falla al arrancar con un error claro; con él, se crea perezosamente una sola vez.
import { describe, expect, it, vi } from "vitest";
import { cargarMotor } from "../../src/lector/carga.js";
import { ErrorServidor, MENSAJE_SIN_MOTOR } from "../../src/index.js";
import { motorFalso } from "./ayudas-lector.js";

describe("carga del motor", () => {
  it("sin motor instalado ni inyectado: ErrorServidor motor-no-instalado con instrucción de instalación", () => {
    const resolver = () => {
      throw new Error("Cannot find module");
    };
    let error: unknown;
    try {
      cargarMotor(undefined, resolver);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorServidor);
    expect((error as ErrorServidor).codigo).toBe("motor-no-instalado");
    expect((error as ErrorServidor).message).toBe(MENSAJE_SIN_MOTOR);
    expect(MENSAJE_SIN_MOTOR).toContain("npm install @lector-cedula/motor");
  });

  it("con motor instalado: se importa en la primera lectura y una sola vez; cerrar lo cierra", async () => {
    const motor = motorFalso();
    const importar = vi.fn(async () => ({ crearMotor: () => motor }));
    const resolver = vi.fn((e: string) => `/ruta/${e}`);
    const perezoso = cargarMotor(undefined, resolver, importar);
    expect(resolver).toHaveBeenCalledWith("@lector-cedula/motor");
    expect(importar).not.toHaveBeenCalled();
    await perezoso.cerrar();
    expect(motor.cerrado).toBe(false);
    const [a, b] = await Promise.all([perezoso.obtener(), perezoso.obtener()]);
    expect(a).toBe(motor);
    expect(b).toBe(motor);
    expect(importar).toHaveBeenCalledTimes(1);
    expect(importar).toHaveBeenCalledWith("@lector-cedula/motor");
    await perezoso.cerrar();
    expect(motor.cerrado).toBe(true);
  });

  it("si crear el motor falla, cerrar no lanza", async () => {
    const perezoso = cargarMotor(undefined, () => "x", async () => {
      throw new Error("recurso-corrupto");
    });
    await expect(perezoso.obtener()).rejects.toThrow("recurso-corrupto");
    await expect(perezoso.cerrar()).resolves.toBeUndefined();
  });

  it("motor inyectado: no se resuelve ni importa nada", async () => {
    const motor = motorFalso();
    const resolver = vi.fn();
    const perezoso = cargarMotor(motor, resolver);
    expect(await perezoso.obtener()).toBe(motor);
    expect(resolver).not.toHaveBeenCalled();
    await perezoso.cerrar();
    expect(motor.cerrado).toBe(true);
  });
});
