// LPI-08 Import sin WASM: importar @lector-cedula/capture no carga zxing-wasm/reader.
import { describe, expect, it, vi } from "vitest";

const contador = vi.hoisted(() => ({ n: 0 }));

vi.mock("zxing-wasm/reader", () => {
  contador.n += 1;
  return {};
});

describe("LPI-08 Licencia y carga diferida", () => {
  it("LPI-08 Import sin WASM", async () => {
    const capture = await import("../../src/index.js");
    expect(typeof capture.decodificarPdf417Imagen).toBe("function");
    expect(contador.n).toBe(0);
  });
});
