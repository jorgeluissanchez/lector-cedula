// MOT-06 (sin red), MOT-07 (sin disco y búferes a cero), MOT-08 (consola limpia) y MOT-03 (sin reglas duplicadas).
// Las lecturas corren en un proceso hijo con bloquear-red.mjs y bloquear-escrituras.mjs, en el hilo principal y en los
// workers del pool (LECTOR_MOTOR_EXEC_ARGV con NODE_ENV=test). Las imágenes las escribe el padre en un temporal; el hijo
// solo lee.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amarilla, digital, sinDocumento } from "./ayudas/imagenes.js";

const RAIZ = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const hook = (n: string) => pathToFileURL(join(RAIZ, "tools", "test", "ayudas", n)).href;
const DIST = pathToFileURL(join(RAIZ, "packages", "motor", "dist", "index.js")).href;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "motor-privacidad-"));
  writeFileSync(join(dir, "amarilla.png"), await amarilla());
  writeFileSync(join(dir, "digital.png"), await digital());
  writeFileSync(join(dir, "sin.png"), sinDocumento());
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let guiones = 0;
/** El guion va a un archivo: con `-e` la bandera --input-type pasaría a los workers de tesseract.js y los rompería. */
function hijo(guion: string): Promise<{ estado: number | null; stdout: string; stderr: string }> {
  const hooks = ["--import", hook("bloquear-escrituras.mjs"), "--import", hook("bloquear-red.mjs")];
  const archivo = join(dir, `guion-${guiones++}.mjs`);
  writeFileSync(archivo, guion);
  return new Promise((resolver, rechazar) => {
    const p = spawn(process.execPath, [...hooks, archivo], {
      env: { ...process.env, NODE_ENV: "test", LECTOR_MOTOR_EXEC_ARGV: hooks.join("\n") },
      timeout: 150_000,
    });
    let stdout = "";
    let stderr = "";
    p.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    p.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    p.on("error", rechazar);
    p.on("close", (estado) => resolver({ estado, stdout, stderr }));
  });
}

const guion = (hilos: number) => `
import { readFileSync } from "node:fs";
import { crearMotor } from ${JSON.stringify(DIST)};
const registro = [];
const consola = [];
for (const m of ["log", "info", "warn", "error", "debug"]) console[m] = (...a) => consola.push(a.map(String).join(" "));
const motor = await crearMotor({ hilos: ${hilos}, registro: (e) => registro.push(e) });
const salida = [];
for (const f of ["amarilla.png", "digital.png", "sin.png"]) {
  const r = await motor.leerDocumento(new Uint8Array(readFileSync(${JSON.stringify(dir)} + "/" + f)), { fechaReferencia: "2026-10-09" });
  salida.push(r.ok ? r.campos.nuip : r.error.codigo);
}
await motor.cerrar();
process.stdout.write(JSON.stringify({ salida, registro, consola }));
`;

describe("MOT-06, MOT-07 y MOT-08 en un proceso con red y escrituras bloqueadas", { timeout: 180_000 }, () => {
  it.each([0, 1])("MOT-06 Red bloqueada y MOT-07 Escrituras prohibidas (hilos %i)", async (hilos) => {
    const r = await hijo(guion(hilos));
    expect(r.stderr).not.toContain("RED-PROHIBIDA");
    expect(r.stderr).not.toContain("ESCRITURA-PROHIBIDA");
    expect(r.estado).toBe(0);
    const { salida, registro, consola } = JSON.parse(r.stdout) as { salida: string[]; registro: unknown[]; consola: string[] };
    expect(salida).toStrictEqual(["9999123456", "9999123456", "sin-lectura"]);
    // MOT-08 Consola limpia: ni la consola ni el registro llevan datos del documento.
    const todo = JSON.stringify({ registro, consola }) + r.stderr;
    for (const prohibido of ["9999123456", "PRUEBA", "FICTICIA", "<<"]) expect(todo).not.toContain(prohibido);
    expect(registro).toHaveLength(3);
  });

  it("MOT-07 los hooks sí detectan escrituras en los workers (control del montaje)", async () => {
    const r = await hijo(`
      import { Worker } from "node:worker_threads";
      const w = new Worker('import { writeFileSync } from "node:fs"; try { writeFileSync("x.txt", "a"); } catch {}', { eval: true, execArgv: process.env.LECTOR_MOTOR_EXEC_ARGV.split("\\n") });
      await new Promise((r) => w.on("exit", r));
    `);
    expect(r.stderr).toContain("ESCRITURA-PROHIBIDA");
  });
});

describe("MOT-03 Sin reglas duplicadas en Node", { timeout: 60_000 }, () => {
  it("MOT-03 packages/motor/src no define checksum MRZ, tabla DIVIPOL ni cálculo de edad", () => {
    const src = join(RAIZ, "packages", "motor", "src");
    const definiciones = /(function|const|let|class)\s+(digitoVerificador|DIVIPOL|calcularEdad|esMayorDeEdad|cumplioAnios)\b/u;
    const tablas = /\[\s*7\s*,\s*3\s*,\s*1\s*\]/u;
    for (const archivo of readdirSync(src)) {
      const texto = readFileSync(join(src, archivo), "utf8");
      expect(definiciones.test(texto), archivo).toBe(false);
      expect(tablas.test(texto), archivo).toBe(false);
    }
  });
});
