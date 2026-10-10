#!/usr/bin/env node
// MOT-02 (`npm run motor:contrato`): el RESULTADO de @lector-cedula/motor (pool de workers, opciones por omisión) es
// igual, campo a campo y con `riesgo`, al de `leer-foto --sin-mascara --resultado` sobre fixtures sintéticos generados en
// memoria (skill fixture-sintetico; ningún dato real). Las imágenes se escriben solo en un temporal fuera del repositorio
// porque la CLI lee rutas; se borran al terminar. Sale con 1 e imprime `fixture: ruta` (sin valores) si algo difiere.
// Modo `--comparar <motor.json> <cli.json> [--nombre x]`: compara dos volcados (prueba del propio comparador).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compararFixture } from "./motor-contrato/comparar.mjs";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI = join(RAIZ, "tools", "leer-foto.mjs");
const FECHA = "2026-10-09";

function salir(lineas) {
  for (const l of lineas) process.stdout.write(`${l}\n`);
  process.exitCode = lineas.length === 0 ? 0 : 1;
}

function correrCli(ruta) {
  return new Promise((resolver, rechazar) => {
    const p = spawn(process.execPath, [CLI, "--sin-mascara", "--resultado", "--fecha-referencia", FECHA, ruta], { timeout: 300_000 });
    let stdout = "";
    p.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    p.on("error", rechazar);
    p.on("close", () => resolver(JSON.parse(stdout)));
  });
}

async function fixtures() {
  const { PERSONA_BASE, generarMrzTd1, generarPdf417 } = await import("../packages/fixtures/dist/index.js");
  const { imagenSintetica, pngBlanco } = await import("../packages/capture/test/pdf417/sintetica.ts");
  const { crearRenderizador } = await import("../evals/sinteticos/render-mrz.mjs");
  const lista = [
    ["amarilla", await imagenSintetica(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes)],
    ["amarilla-8-digitos", await imagenSintetica(generarPdf417({ ...PERSONA_BASE, nuip: "99991234" }, { semilla: 1 }).bytes)],
    ["amarilla-lugar-desconocido", await imagenSintetica(generarPdf417({ ...PERSONA_BASE, departamento: "99", municipio: "999" }, { semilla: 1 }).bytes)],
    ["sin-documento", pngBlanco(800, 600)],
  ];
  const render = await crearRenderizador();
  try {
    lista.push(["digital", (await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes]);
    lista.push(["digital-cd-alterado", (await render.render(generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" }).lineas)).bytes]);
  } finally {
    await render.cerrar();
  }
  return lista;
}

async function principal(argv) {
  if (argv[0] === "--comparar") {
    const i = argv.indexOf("--nombre");
    const nombre = i === -1 ? "volcado" : argv[i + 1];
    const leer = (r) => JSON.parse(readFileSync(r, "utf8"));
    return salir(compararFixture(nombre, leer(argv[1]), leer(argv[2])));
  }
  const { crearMotor } = await import("../packages/motor/dist/index.js");
  const dir = mkdtempSync(join(tmpdir(), "motor-contrato-"));
  // Mismo presupuesto de OCR que la CLI para que la comparación sea de la misma lectura.
  const motor = await crearMotor({ hilos: 1, llamadasOcrMaximas: 40, tiempoMaximoMs: 600_000 });
  const lineas = [];
  let n = 0;
  try {
    for (const [nombre, bytes] of await fixtures()) {
      const ruta = join(dir, `${nombre}.png`);
      writeFileSync(ruta, bytes);
      const deMotor = await motor.leerDocumento(new Uint8Array(bytes), { fechaReferencia: FECHA });
      lineas.push(...compararFixture(nombre, deMotor, await correrCli(ruta)));
      n++;
    }
  } finally {
    await motor.cerrar();
    rmSync(dir, { recursive: true, force: true });
  }
  process.stderr.write(`motor-contrato: ${n} fixtures, ${lineas.length} diferencias\n`);
  return salir(lineas);
}

await principal(process.argv.slice(2));
