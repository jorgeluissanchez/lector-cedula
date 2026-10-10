// D3 de design.md y MOT-01: códigos de error del motor, compartidos por @lector-cedula/motor y @lector-cedula/servidor.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CODIGOS_ERROR_MOTOR, codigoErrorMotor, ErrorMotor } from "../src/index.js";

describe("ErrorMotor", { timeout: 60_000 }, () => {
  it("MOT-01 los 9 códigos de D3, literales", () => {
    expect(CODIGOS_ERROR_MOTOR).toStrictEqual([
      "formato-no-soportado",
      "imagen-demasiado-grande",
      "tiempo-agotado",
      "motor-ocupado",
      "motor-cerrado",
      "motor-error-interno",
      "recurso-corrupto",
      "cancelado",
      "opciones-invalidas",
    ]);
  });

  it("MOT-01 ErrorMotor lleva el código como mensaje y nombre propio", () => {
    const e = new ErrorMotor("motor-ocupado");
    expect(e).toBeInstanceOf(Error);
    expect(e.codigo).toBe("motor-ocupado");
    expect(e.message).toBe("motor-ocupado");
    expect(e.name).toBe("ErrorMotor");
  });

  it("MOT-01 codigoErrorMotor reconoce errores que cruzaron un hilo (objeto plano)", () => {
    expect(codigoErrorMotor(new ErrorMotor("cancelado"))).toBe("cancelado");
    expect(codigoErrorMotor({ codigo: "tiempo-agotado" })).toBe("tiempo-agotado");
    expect(codigoErrorMotor({ codigo: "inventado" })).toBeNull();
    expect(codigoErrorMotor({ codigo: 3 })).toBeNull();
    expect(codigoErrorMotor(new Error("x"))).toBeNull();
    expect(codigoErrorMotor(null)).toBeNull();
    expect(codigoErrorMotor("motor-ocupado")).toBeNull();
  });

  it("MOT-01 codigoErrorMotor nunca lanza", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const c = codigoErrorMotor(x);
        expect(c === null || (CODIGOS_ERROR_MOTOR as readonly string[]).includes(c)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});
