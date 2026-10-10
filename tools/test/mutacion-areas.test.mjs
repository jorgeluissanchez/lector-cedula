// Áreas de mutación (stryker.config.mjs) y matriz del workflow .github/workflows/mutacion.yml: deben coincidir para que
// ningún archivo quede sin mutar en CI. Lanza un proceso de Node: timeout de 60 s (CLAUDE.md, errores pasados).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config, { AREAS } from "../../stryker.config.mjs";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function areasDelWorkflow() {
  const texto = readFileSync(join(RAIZ, ".github", "workflows", "mutacion.yml"), "utf8");
  const m = /^\s*area:\s*\[([^\]]+)\]/mu.exec(texto);
  if (!m) throw new Error("mutacion.yml sin matriz area");
  return m[1].split(",").map((a) => a.trim());
}

describe("áreas de mutación", { timeout: 60_000 }, () => {
  it("la matriz del workflow tiene exactamente las áreas de stryker.config.mjs (atrapa: área nueva que CI no muta)", () => {
    expect([...areasDelWorkflow()].sort()).toStrictEqual(Object.keys(AREAS).sort());
  });

  it("cada área declara archivos y un break entre 0 y 100", () => {
    for (const [nombre, a] of Object.entries(AREAS)) {
      expect(a.mutate.filter((p) => !p.startsWith("!")).length, nombre).toBeGreaterThan(0);
      expect(a.break, nombre).toBeGreaterThanOrEqual(0);
      expect(a.break, nombre).toBeLessThanOrEqual(100);
    }
  });

  it("sin STRYKER_AREA se muta la unión de todas las áreas con break 85 (npm run test:mutacion local)", () => {
    expect(process.env.STRYKER_AREA).toBeUndefined();
    expect(config.mutate).toStrictEqual(Object.values(AREAS).flatMap((a) => a.mutate));
    expect(config.thresholds.break).toBe(85);
  });

  it("con STRYKER_AREA se mutan solo sus archivos, con su break y sandbox propia; un área desconocida falla", () => {
    const leer = (area) =>
      spawnSync(process.execPath, ["--input-type=module", "-e", `const c = (await import("./stryker.config.mjs")).default; process.stdout.write(JSON.stringify(c));`], {
        cwd: RAIZ,
        env: { ...process.env, STRYKER_AREA: area },
        encoding: "utf8",
      });
    const r = leer("parsers");
    expect(r.status, r.stderr).toBe(0);
    const c = JSON.parse(r.stdout);
    expect(c.mutate).toStrictEqual(AREAS.parsers.mutate);
    expect(c.thresholds.break).toBe(AREAS.parsers.break);
    expect(c.tempDirName).toBe(".stryker-tmp-area-parsers");
    const mala = leer("no-existe");
    expect(mala.status).not.toBe(0);
    expect(mala.stderr).toMatch(/STRYKER_AREA desconocida: no-existe/u);
  });
});
