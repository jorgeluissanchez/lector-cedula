// Cambio otros-documentos, OD-23: clasificación de los errores nuevos de la lectura (documento no admitido, TI de un
// mayor de edad y errores del parser TD3) para la pantalla `error-lectura` de la PWA.
import { describe, expect, it } from "vitest";
import { clasificarErrorLectura, TEXTOS_ERROR_LECTURA } from "../../src/lectura/errores.js";

describe("OD-23 Mensajes de la PWA por documento", () => {
  it("OD-23 Documento no admitido: texto literal de la spec, con y sin tipo", () => {
    const texto = "Este tipo de documento no está admitido en este servicio.";
    expect(clasificarErrorLectura({ ok: false, tipo: "mrz", error: "documento-no-admitido", warnings: ["T01"] })).toStrictEqual({ codigo: "documento-no-admitido", texto });
    expect(clasificarErrorLectura({ ok: false, tipo: "pdf417", error: "documento-no-admitido" })).toStrictEqual({ codigo: "documento-no-admitido", texto });
    expect(TEXTOS_ERROR_LECTURA["documento-no-admitido"]).toBe(texto);
  });

  it("OD-32 TI de un mayor de edad: código propio con su texto", () => {
    expect(clasificarErrorLectura({ ok: false, tipo: "pdf417", error: "ti-mayor-de-edad" })).toStrictEqual({
      codigo: "ti-mayor-de-edad",
      texto: "Esta tarjeta de identidad es de una persona mayor de edad. Usa la cédula de ciudadanía.",
    });
  });

  it("OD-23 no-es-pasaporte y formato-td3 son no-valido", () => {
    expect(clasificarErrorLectura({ ok: false, tipo: "mrz", error: "no-es-pasaporte" }).codigo).toBe("no-valido");
    expect(clasificarErrorLectura({ ok: false, tipo: "mrz", error: "formato-td3" }).codigo).toBe("no-valido");
  });
});
