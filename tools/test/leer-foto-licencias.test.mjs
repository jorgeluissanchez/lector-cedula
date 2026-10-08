// DC-10 (divipol-consulados-2018): la CLI leer-foto imprime la atribución CC BY-SA 4.0 con --licencias.
// No lee imágenes: solo lanza la CLI con la opción y compara con packages/parsers/THIRD_PARTY_NOTICES.md.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = join(RAIZ, "tools", "leer-foto.mjs");
const AVISOS = readFileSync(join(RAIZ, "packages", "parsers", "THIRD_PARTY_NOTICES.md"), "utf8");

describe("DC-10 Opción --licencias", { timeout: 60_000 }, () => {
  it("DC-10 imprime el aviso íntegro y termina con 0", () => {
    const r = spawnSync(process.execPath, [CLI, "--licencias"], { cwd: RAIZ, encoding: "utf8", timeout: 60_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(AVISOS);
    for (const texto of ["Registraduría Nacional del Estado Civil", "DANE", "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es"]) {
      expect(r.stdout).toContain(texto);
    }
  });

  it("DC-10 --licencias no exige ruta aunque haya otras opciones", () => {
    const r = spawnSync(process.execPath, [CLI, "--sin-mascara", "--licencias"], { cwd: RAIZ, encoding: "utf8", timeout: 60_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(AVISOS);
  });
});
