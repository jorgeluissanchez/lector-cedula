// MOT-12 (tarea 1.1): ESM y CommonJS leen la amarilla con @lector-cedula/motor y @lector-cedula/servidor carga en ambos;
// con la condición `edge-light` la importación falla con un mensaje claro. La matriz Node 20/22/24 en Docker queda
// fuera de esta prueba (ver tasks.md).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amarilla, NUIP } from "../../../motor/test/ayudas/imagenes.js";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
let dir: string;
let ruta: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "servidor-compat-"));
  ruta = join(dir, "amarilla.png");
  writeFileSync(ruta, await amarilla());
}, 60_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function node(args: string[]): Promise<{ estado: number | null; stdout: string; stderr: string }> {
  return new Promise((resolver, rechazar) => {
    const p = spawn(process.execPath, args, { cwd: RAIZ, timeout: 120_000 });
    let stdout = "";
    let stderr = "";
    p.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    p.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    p.on("error", rechazar);
    p.on("close", (estado) => resolver({ estado, stdout, stderr }));
  });
}

const leer = (ruta: string) => `
const motor = await crearMotor({ hilos: 1 });
const r = await motor.leerDocumento(new Uint8Array(readFileSync(${JSON.stringify(ruta)})), { fraude: false });
await motor.cerrar();
process.stdout.write(String(r.campos.nuip) + "|" + typeof crearLectorServidor);`;

describe("MOT-12 compatibilidad de runtimes Node", { timeout: 120_000 }, () => {
  it("MOT-12 ESM", async () => {
    const r = await node([
      "--input-type=module",
      "-e",
      `import { readFileSync } from "node:fs"; import { crearMotor } from "@lector-cedula/motor"; import { crearLectorServidor } from "@lector-cedula/servidor";${leer(ruta)}`,
    ]);
    expect(r.stdout).toBe(`${NUIP}|function`);
  });

  it("MOT-12 CJS (require)", async () => {
    const r = await node([
      "--input-type=commonjs",
      "-e",
      `const { readFileSync } = require("node:fs"); const { crearMotor } = require("@lector-cedula/motor"); const { crearLectorServidor } = require("@lector-cedula/servidor"); (async () => {${leer(ruta)}})();`,
    ]);
    expect(r.stdout).toBe(`${NUIP}|function`);
  });

  it.each(["servidor", "motor"])("MOT-12 Edge: @lector-cedula/%s con edge-light falla con mensaje claro", async (paquete) => {
    const r = await node(["--conditions=edge-light", "--input-type=module", "-e", `await import("@lector-cedula/${paquete}");`]);
    expect(r.estado).not.toBe(0);
    expect(r.stderr).toContain(`@lector-cedula/${paquete} requiere runtime nodejs`);
  });
});
