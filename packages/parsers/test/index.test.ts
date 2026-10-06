import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("@lector-cedula/parsers", () => {
  it("expone la versión del paquete", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
