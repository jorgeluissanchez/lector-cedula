// MOT-02: contrato motor contra CLI (`npm run motor:contrato`) y su comparador.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compararFixture, diferencias, ordenar } from "../motor-contrato/comparar.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const GUION = join(RAIZ, "tools", "motor-contrato.mjs");
const dir = mkdtempSync(join(tmpdir(), "motor-contrato-prueba-"));
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

const RESULTADO = {
  ok: true,
  tipoDocumento: "cedula-ciudadania",
  fuente: "pdf417",
  campos: { nuip: "9999123456", apellidos: "PRUEBA EJEMPLO" },
  warnings: [],
  confiable: false,
  riesgo: { nivel: "bajo", puntaje: 3 },
};

describe("MOT-02 comparador", { timeout: 60_000 }, () => {
  it("ordenar no depende del orden de las claves", () => {
    expect(JSON.stringify(ordenar({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 2 } }))).toBe('{"a":{"c":2,"d":[{"y":2,"z":1}]},"b":1}');
  });

  it("diferencias da rutas, incluida la raíz y tipos distintos", () => {
    expect(diferencias(RESULTADO, structuredClone(RESULTADO))).toStrictEqual([]);
    expect(diferencias({ a: [1, 2] }, { a: [1, 3], b: null })).toStrictEqual(["a.1", "b"]);
    expect(diferencias(1, 2)).toStrictEqual(["(raiz)"]);
    expect(diferencias({ a: [] }, { a: {} })).toStrictEqual(["a"]);
    expect(diferencias({ a: null }, { a: {} })).toStrictEqual(["a"]);
  });

  it("MOT-02 El contrato detecta divergencias: campos.nuip alterado, código 1, ruta y fixture sin el valor", async () => {
    const alterado = { ...RESULTADO, campos: { ...RESULTADO.campos, nuip: "9999123457" } };
    expect(compararFixture("amarilla", alterado, RESULTADO)).toStrictEqual(["amarilla: campos.nuip"]);
    writeFileSync(join(dir, "motor.json"), JSON.stringify(alterado));
    writeFileSync(join(dir, "cli.json"), JSON.stringify(RESULTADO));
    const r = await correr("--comparar", join(dir, "motor.json"), join(dir, "cli.json"), "--nombre", "amarilla-1080p.png");
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("amarilla-1080p.png: campos.nuip\n");
    expect(r.stdout + r.stderr).not.toContain("9999123457");
    expect(r.stdout + r.stderr).not.toContain("9999123456");
  });

  it("MOT-02 riesgo también se compara", async () => {
    expect(compararFixture("digital", { ...RESULTADO, riesgo: { nivel: "alto", puntaje: 3 } }, RESULTADO)).toStrictEqual(["digital: riesgo.nivel"]);
  });

  it("MOT-02 volcados iguales con claves en otro orden: código 0", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify(RESULTADO));
    writeFileSync(join(dir, "b.json"), JSON.stringify(ordenar(RESULTADO)));
    const r = await correr("--comparar", join(dir, "a.json"), join(dir, "b.json"));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("MOT-02 Igualdad en los fixtures", { timeout: 600_000 }, () => {
  it("MOT-02 motor y CLI dan el mismo RESULTADO en el 100 % de los fixtures sintéticos", async () => {
    const r = await correr();
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/motor-contrato: 6 fixtures, 0 diferencias/u);
    expect(r.status).toBe(0);
  });
});
