// FRA-01 contrato de tipos (tarea 1.1): los @ts-expect-error de test/tipos/contrato.ts deben ser errores reales.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));

describe("FRA-01 contrato de tipos", { timeout: 60_000 }, () => {
  it("FRA-01 código fuera del vocabulario: TypeScript produce el error esperado", () => {
    const tsc = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));
    let salida = "";
    try {
      execFileSync(process.execPath, [tsc, "-p", "packages/fraud/tsconfig.contrato.json"], { cwd: raiz, encoding: "utf8" });
    } catch (e) {
      salida = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(salida).toBe("");
  });
});
