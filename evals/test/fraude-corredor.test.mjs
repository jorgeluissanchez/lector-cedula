// FRA-14 (cambio deteccion-fraude, tarea 2.2): integración del corredor `eval:fraude` con baseline temporal.
// Nunca escribe en evals/reports/: el reporte va a un directorio temporal.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CORREDOR = join("evals", "runners", "fraude", "eval-fraude.mjs");
const temporales = [];
afterEach(() => {
  while (temporales.length > 0) rmSync(temporales.pop(), { recursive: true, force: true });
});

function correr(baseline) {
  const dir = mkdtempSync(join(tmpdir(), "eval-fraude-"));
  temporales.push(dir);
  const rutaBaseline = join(dir, "baseline.json");
  if (baseline !== undefined) writeFileSync(rutaBaseline, JSON.stringify(baseline));
  const reporte = join(dir, "reporte.json");
  const r = spawnSync(
    process.execPath,
    [CORREDOR, "--muestras", "1", "--frames", "1", "--tipos", "amarilla", "--clases", "autentica,pantalla", "--baseline", rutaBaseline, "--reporte", reporte],
    { cwd: RAIZ, encoding: "utf8" },
  );
  return { r, reporte: r.status === 2 ? null : JSON.parse(readFileSync(reporte, "utf8")) };
}

describe("FRA-14 corredor eval:fraude", { timeout: 60_000 }, () => {
  it("FRA-14 sin baseline: reporta y sale con 0", () => {
    const { r, reporte } = correr(undefined);
    expect(r.status, r.stderr).toBe(0);
    expect(reporte.sintetico).toBe(true);
    expect(reporte.documentos.amarilla.especies.pantalla.apcer).toBe(0);
    expect(reporte.documentos.amarilla.bpcer).toBe(0);
    expect(r.stdout).toContain("sin baseline");
  });

  it("FRA-14 regresión frente al baseline: sale con 1 y nombra la métrica", () => {
    const { r } = correr({ documentos: { amarilla: { especies: { pantalla: { apcer: -0.5 } } } } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("documentos.amarilla.especies.pantalla.apcer");
  });

  it("FRA-14 argumentos inválidos: código 2", () => {
    const r = spawnSync(process.execPath, [CORREDOR, "--clases", "deepfake"], { cwd: RAIZ, encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});
