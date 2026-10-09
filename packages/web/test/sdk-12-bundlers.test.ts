// SDK-12 "Next sin errores": Turbopack y webpack tratan `new URL("<literal>", import.meta.url)` como un asset y fallan
// con una carpeta ("Can't resolve './assets/'"). El núcleo resuelve la carpeta por omisión en tiempo de ejecución.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { recursosPorOmision } from "../src/cargador.js";

describe("SDK-12 compatibilidad con bundlers", () => {
  it("SDK-12 recursos por omisión: la carpeta assets/ junto al módulo", () => {
    expect(recursosPorOmision()).toBe(new URL("../src/assets/", import.meta.url).href);
  });

  it("SDK-12 ningún archivo del núcleo construye una URL a partir de import.meta.url con new URL (Turbopack, webpack)", async () => {
    for (const n of ["cargador.ts", "dependencias.ts", "lectura-headless.ts", "index.ts"]) {
      const t = await readFile(new URL(`../src/${n}`, import.meta.url), "utf8");
      expect(t, n).not.toMatch(/new URL\([^)]*import\.meta\.url/u);
      expect(t, n).not.toMatch(/=\s*import\.meta\.url\s*;/u);
    }
  });
});
