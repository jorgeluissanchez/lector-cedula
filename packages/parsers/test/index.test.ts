import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";
import * as paquete from "../src/index.js";

describe("@lector-cedula/parsers", () => {
  it("expone la versión del paquete", () => {
    expect(VERSION).toBe("0.0.0");
  });

  it("exporta parsearPdf417Amarilla (cambio parser-pdf417-amarilla)", () => {
    expect(typeof paquete.parsearPdf417Amarilla).toBe("function");
    expect(paquete.parsearPdf417Amarilla(new Uint8Array(0))).toStrictEqual({ ok: false, error: "entrada-vacia" });
  });
});
