// El índice público expone el núcleo de calidad (design.md, decisión 2). El paquete lo comparten otros cambios
// (lectura de PDF417), así que se exige que estén las exportaciones de la calidad, no que sean las únicas.
import { describe, expect, it } from "vitest";
import * as capture from "../src/index.js";

describe("Índice público de @lector-cedula/capture", () => {
  it("exporta el núcleo de calidad", () => {
    expect(Object.keys(capture)).toEqual(
      expect.arrayContaining([
        "LADO_ANALISIS",
        "MOTIVOS",
        "UMBRALES_POR_DEFECTO",
        "analizarFrame",
        "crearConfiguracionUmbrales",
        "dimensionesAnalisis",
        "luminancia",
        "luminanciasFrame",
        "validarUmbrales",
      ]),
    );
    expect(capture.MOTIVOS).toStrictEqual(["acerca", "oscuro", "sobreexpuesto", "reflejo", "desenfocado"]);
    expect(capture.LADO_ANALISIS).toBe(640);
    expect(capture.UMBRALES_POR_DEFECTO.umbralListo).toBe(70);
  });
});
