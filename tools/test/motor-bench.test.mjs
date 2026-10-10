// MOT-11 (`npm run motor:bench`): percentil, evaluación de umbrales con código de salida y una corrida corta real.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { evaluar, percentil, UMBRALES } from "../motor-bench/evaluar.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const GUION = join(RAIZ, "tools", "motor-bench.mjs");
const dir = mkdtempSync(join(tmpdir(), "motor-bench-prueba-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function correr(...args) {
  return new Promise((resolver, rechazar) => {
    const p = spawn(process.execPath, [GUION, ...args], { cwd: RAIZ, timeout: 400_000 });
    let stdout = "";
    let stderr = "";
    p.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    p.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    p.on("error", rechazar);
    p.on("close", (status) => resolver({ status, stdout, stderr }));
  });
}

const INFORME_OK = { p95_amarilla_ms: 1500, p95_digital_ms: 2500, frio_ms: 4000, lecturas_fallidas: 0 };

describe("MOT-11 motor:bench", { timeout: 60_000 }, () => {
  it("MOT-11 umbrales literales de la spec", () => {
    expect(UMBRALES).toStrictEqual({ p95_amarilla_ms: 1500, p95_digital_ms: 2500, frio_ms: 4000 });
  });

  it("MOT-11 percentil 95 por rango más cercano", () => {
    const veinte = Array.from({ length: 20 }, (_v, i) => 20 - i); // 20..1 desordenado
    expect(percentil(veinte, 95)).toBe(19);
    expect(percentil([7], 95)).toBe(7);
    expect(percentil(Array.from({ length: 200 }, (_v, i) => i + 1), 95)).toBe(190);
    expect(percentil([3, 1, 2], 50)).toBe(2);
    expect(() => percentil([], 95)).toThrow("sin-muestras");
  });

  it("MOT-11 propiedad: el percentil es una muestra, cubre al menos p % y no muta la entrada", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 300 }), fc.integer({ min: 1, max: 100 }), (xs, p) => {
        const copia = [...xs];
        const v = percentil(xs, p);
        expect(xs).toStrictEqual(copia);
        expect(xs).toContain(v);
        expect(xs.filter((x) => x <= v).length / xs.length).toBeGreaterThanOrEqual(p / 100);
      }),
      { numRuns: 1000 },
    );
  });

  it("MOT-11 en el umbral pasa; un milisegundo por encima falla con su clave", () => {
    expect(evaluar(INFORME_OK)).toStrictEqual([]);
    expect(evaluar({ ...INFORME_OK, p95_amarilla_ms: 1501 })).toStrictEqual(["p95_amarilla_ms"]);
    expect(evaluar({ ...INFORME_OK, p95_digital_ms: 2501 })).toStrictEqual(["p95_digital_ms"]);
    expect(evaluar({ ...INFORME_OK, frio_ms: 4001 })).toStrictEqual(["frio_ms"]);
    expect(evaluar({ ...INFORME_OK, lecturas_fallidas: 1 })).toStrictEqual(["lecturas_fallidas"]);
    expect(evaluar({ p95_amarilla_ms: 9e9, p95_digital_ms: 9e9, frio_ms: 9e9, lecturas_fallidas: 2 })).toStrictEqual(["p95_amarilla_ms", "p95_digital_ms", "frio_ms", "lecturas_fallidas"]);
  });

  it("MOT-11 valores ausentes o no numéricos fallan (nunca pasan por omisión)", () => {
    expect(evaluar({})).toStrictEqual(["p95_amarilla_ms", "p95_digital_ms", "frio_ms", "lecturas_fallidas"]);
    expect(evaluar({ ...INFORME_OK, frio_ms: "1" })).toStrictEqual(["frio_ms"]);
    expect(evaluar({ ...INFORME_OK, p95_digital_ms: Number.NaN })).toStrictEqual(["p95_digital_ms"]);
  });

  it("MOT-11 --evaluar sale con 1 e imprime la clave si un umbral falla, y con 0 si no", async () => {
    const malo = join(dir, "malo.json");
    const bueno = join(dir, "bueno.json");
    writeFileSync(malo, JSON.stringify({ ...INFORME_OK, p95_digital_ms: 2600 }));
    writeFileSync(bueno, JSON.stringify(INFORME_OK));
    const r1 = await correr("--evaluar", malo);
    expect(r1.status).toBe(1);
    expect(r1.stdout.trim()).toBe("umbral superado: p95_digital_ms");
    const r0 = await correr("--evaluar", bueno);
    expect(r0.status).toBe(0);
    expect(r0.stdout).toBe("");
  });

  it("MOT-11 argumentos inválidos: código 64", async () => {
    expect((await correr("--lecturas", "0")).status).toBe(64);
    expect((await correr("--hilos", "x")).status).toBe(64);
    expect((await correr("--desconocida")).status).toBe(64);
  });

  it("MOT-11 corrida corta real: informe JSON con las claves de la spec y sin datos del documento", { timeout: 300_000 }, async () => {
    const r = await correr("--lecturas", "2");
    const informe = JSON.parse(r.stdout);
    for (const k of ["p95_amarilla_ms", "p95_digital_ms", "frio_ms"]) expect(typeof informe[k]).toBe("number");
    expect(informe).toMatchObject({ hilos: 2, lecturas: 2, lecturas_fallidas: 0, umbrales: UMBRALES });
    expect(informe.fallos_por_codigo).toStrictEqual({ amarilla: {}, digital: {} });
    expect(informe.maquina).toMatchObject({ cpus: expect.any(Number), memoria_gb: expect.any(Number) });
    expect(r.status).toBe(evaluar(informe).length === 0 ? 0 : 1);
    expect(r.stdout + r.stderr).not.toMatch(/9999123456|PRUEBA/u);
  });
});
