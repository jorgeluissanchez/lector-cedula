// FRA-13 (cambio deteccion-fraude, tarea 2.1): generador de escenas sintéticas de ataques. Determinismo por
// semilla y manifiesto con "sintetico": true. Lanza el CLI real sobre directorios temporales.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validarManifiesto } from "../fraude/sinteticos-lib.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = join("tools", "fraude", "generar-sinteticos.mjs");
const temporales = [];
afterEach(() => {
  while (temporales.length > 0) rmSync(temporales.pop(), { recursive: true, force: true });
});

function generar(...args) {
  const salida = mkdtempSync(join(tmpdir(), "fraude-sint-"));
  temporales.push(salida);
  const r = spawnSync(process.execPath, [CLI, "--salida", salida, ...args], { cwd: RAIZ, encoding: "utf8" });
  return { r, salida, manifiesto: r.status === 0 ? JSON.parse(readFileSync(join(salida, "manifest.json"), "utf8")) : null };
}

describe("FRA-13 dataset sintético de ataques", { timeout: 60_000 }, () => {
  it("FRA-13 determinismo: la clase pantalla con semilla 1 genera los mismos sha256", () => {
    const a = generar("--clases", "pantalla", "--tipos", "amarilla", "--muestras", "1", "--frames", "1");
    const b = generar("--clases", "pantalla", "--tipos", "amarilla", "--muestras", "1", "--frames", "1");
    expect(a.r.status, a.r.stderr).toBe(0);
    const sha = (m) => m.entradas.flatMap((e) => e.archivos.map((f) => f.sha256));
    expect(sha(a.manifiesto)).toHaveLength(1);
    expect(sha(a.manifiesto)).toStrictEqual(sha(b.manifiesto));
    const c = generar("--clases", "pantalla", "--tipos", "amarilla", "--muestras", "1", "--frames", "1", "--semilla-inicial", "2");
    expect(sha(c.manifiesto)).not.toStrictEqual(sha(a.manifiesto));
  });

  it("FRA-13 manifiesto sintético: cada entrada con sintetico true y sin datos personales", () => {
    const { r, manifiesto } = generar("--clases", "autentica,recortada", "--tipos", "amarilla,digital", "--muestras", "1", "--frames", "1");
    expect(r.status, r.stderr).toBe(0);
    expect(manifiesto.sintetico).toBe(true);
    expect(manifiesto.entradas).toHaveLength(4);
    for (const e of manifiesto.entradas) {
      expect(e.sintetico).toBe(true);
      expect(e.id).toMatch(/^(amarilla|digital)-(autentica|recortada)-semilla-1$/);
    }
    expect(validarManifiesto(manifiesto)).toStrictEqual({ ok: true });
  });

  it("FRA-13 por defecto: las siete clases, dos tipos y 200 muestras", async () => {
    const { planGeneracion } = await import("../fraude/sinteticos-lib.mjs");
    const plan = planGeneracion({});
    expect(plan.clases).toStrictEqual(["autentica", "pantalla", "fotocopia-gris", "fotocopia-color", "impresion", "recortada", "editada"]);
    expect(plan.tipos).toStrictEqual(["amarilla", "digital"]);
    expect(plan.muestras).toBe(200);
  });

  it("FRA-13 rechaza manifiestos sin sintetico o con claves de datos personales", () => {
    expect(validarManifiesto({ sintetico: true, entradas: [{ id: "x", sintetico: false, archivos: [] }] }).ok).toBe(false);
    expect(validarManifiesto({ sintetico: true, entradas: [{ id: "x", sintetico: true, archivos: [], nuip: "1" }] }).ok).toBe(false);
    expect(validarManifiesto({ entradas: [] }).ok).toBe(false);
  });

  it("FRA-13 argumentos inválidos salen con código 2", () => {
    expect(generar("--clases", "deepfake").r.status).toBe(2);
    expect(generar("--muestras", "0").r.status).toBe(2);
  });
});
