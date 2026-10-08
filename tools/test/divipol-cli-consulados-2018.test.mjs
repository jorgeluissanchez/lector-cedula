// Integración de la CLI con el módulo de consulados 2018 (cambio divipol-consulados-2018, DC-06 y DC-07).
// Excluida de Stryker (vitest.stryker.config.ts), como divipol-cli.test.mjs. Datos públicos, ningún dato personal.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const FUENTES = join(RAIZ, "tools", "divipol", "fuentes");
const MANIFIESTO = join(RAIZ, "tools", "divipol", "fuentes.json");
const CLI = join(RAIZ, "tools", "divipol", "generar-divipol.mjs");
const TEXTO = readFileSync(join(FUENTES, "consulados-2018.csv"), "utf8");

describe("DC-07 CLI con el módulo 2018", { timeout: 60_000 }, () => {
  const correr = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: RAIZ, encoding: "utf8", timeout: 50_000 });
  const ARCHIVO = join("divipol-2018", "consulados.generated.ts");

  it("DC-07 la generación en un directorio temporal produce el módulo 2018 idéntico al versionado", () => {
    const salida = mkdtempSync(join(tmpdir(), "consulados-2018-"));
    const r = correr("--salida", salida);
    expect(r.status).toBe(0);
    expect(readFileSync(join(salida, ARCHIVO))).toStrictEqual(readFileSync(join(RAIZ, "packages", "parsers", "src", ARCHIVO)));
  });

  it("DC-07 Deriva detectada: nombre alterado en una copia -> código 1 con el archivo", () => {
    const salida = mkdtempSync(join(tmpdir(), "consulados-2018-deriva-"));
    expect(correr("--salida", salida).status).toBe(0);
    const ruta = join(salida, ARCHIVO);
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace('"VIETNAM"', '"VIET NAM"'));
    const r = correr("--verificar", "--salida", salida);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("consulados.generated.ts");
  });

  it("DC-06 Fuente con 68 filas en la CLI: código 1, nombra 69 y no escribe archivos", () => {
    const dir = mkdtempSync(join(tmpdir(), "consulados-2018-68-"));
    const fuentes = join(dir, "fuentes");
    mkdirSync(fuentes);
    cpSync(FUENTES, fuentes, { recursive: true });
    const recortado = TEXTO.trimEnd().split("\n").slice(0, -1).join("\n") + "\n";
    writeFileSync(join(fuentes, "consulados-2018.csv"), recortado);
    const manifiesto = JSON.parse(readFileSync(MANIFIESTO, "utf8")).map((f) =>
      f.id === "registraduria-consulados-2018" ? { ...f, sha256: createHash("sha256").update(recortado).digest("hex") } : f,
    );
    writeFileSync(join(dir, "fuentes.json"), JSON.stringify(manifiesto));
    const salida = join(dir, "salida");
    const r = correr("--manifiesto", join(dir, "fuentes.json"), "--fuentes", fuentes, "--salida", salida);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("69");
    expect(existsSync(salida) ? readdirSync(salida) : []).toStrictEqual([]);
  });
});
