// LPI-08 Licencia: versión exacta declarada en packages/capture/package.json.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LPI-08 Licencia y carga diferida", () => {
  it("LPI-08 Licencia: zxing-wasm declarado con versión exacta 3.1.5", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["zxing-wasm"]).toBe("3.1.5");
  });
});
