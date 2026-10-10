#!/usr/bin/env node
// MOT-11 (`npm run motor:bench`): rendimiento de @lector-cedula/motor. Mide el arranque en frío (`crearMotor` hasta la
// primera lectura) y, con el motor caliente, la latencia de `--lecturas` lecturas secuenciales de la amarilla y de la
// digital sintéticas (PERSONA_BASE, generadas en memoria; ningún dato real, nada en disco). Imprime un informe JSON sin
// datos del documento y sale con 1 si un umbral falla. Los umbrales valen en `REF_SRV` (2 vCPU, 2 GiB, x64:
// `docker run --cpus 2 --memory 2g`); en otra máquina el informe es orientativo y lo dice `maquina`.
// Uso: npm run motor:bench -- [--lecturas 200] [--hilos 2] | --evaluar <informe.json>
import { readFileSync } from "node:fs";
import { availableParallelism, arch, platform, totalmem } from "node:os";
import { evaluar, percentil, UMBRALES } from "./motor-bench/evaluar.mjs";

const USO = "uso: npm run motor:bench -- [--lecturas N] [--hilos N] | --evaluar <informe.json>";
const FECHA = "2026-10-09";

function uso(motivo) {
  process.stderr.write(`motor-bench: ${motivo}\n${USO}\n`);
  process.exitCode = 64;
  return null;
}

function argumentos(argv) {
  const op = { lecturas: 200, hilos: 2, evaluar: null };
  for (let i = 0; i < argv.length; i += 2) {
    const [clave, valor] = [argv[i], argv[i + 1]];
    if (clave === "--evaluar" && valor !== undefined) op.evaluar = valor;
    else if ((clave === "--lecturas" || clave === "--hilos") && /^[1-9]\d*$/u.test(valor ?? "")) op[clave.slice(2)] = Number(valor);
    else return uso(`argumento no válido: ${clave}`);
  }
  return op;
}

function informar(fallos) {
  for (const f of fallos) process.stdout.write(`umbral superado: ${f}\n`);
  process.exitCode = fallos.length === 0 ? 0 : 1;
}

async function imagenes() {
  const { PERSONA_BASE, generarMrzTd1, generarPdf417 } = await import("../packages/fixtures/dist/index.js");
  const { imagenSintetica } = await import("../packages/capture/test/pdf417/sintetica.ts");
  const { crearRenderizador } = await import("../evals/sinteticos/render-mrz.mjs");
  const amarilla = await imagenSintetica(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const render = await crearRenderizador();
  try {
    return { amarilla, digital: (await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes, nuip: PERSONA_BASE.nuip };
  } finally {
    await render.cerrar();
  }
}

/** Lecturas fallidas por código (solo códigos de error, nunca datos del documento). */
function anotarFallo(codigos, r, error) {
  const codigo = r?.ok === false ? r.error.codigo : r?.ok === true ? "nuip-distinto" : (error?.codigo ?? "error");
  codigos[codigo] = (codigos[codigo] ?? 0) + 1;
}

async function medir(motor, imagen, nuip, n) {
  const tiempos = [];
  const codigos = {};
  let fallidas = 0;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    let error = null;
    const r = await motor.leerDocumento(new Uint8Array(imagen), { fechaReferencia: FECHA }).catch((e) => {
      error = e;
      return null;
    });
    tiempos.push(performance.now() - t);
    if (r?.ok !== true || r.campos.nuip !== nuip) {
      fallidas++;
      anotarFallo(codigos, r, error);
    }
  }
  return { p95: Math.round(percentil(tiempos, 95)), p50: Math.round(percentil(tiempos, 50)), fallidas, codigos };
}

async function principal(argv) {
  const op = argumentos(argv);
  if (op === null) return;
  if (op.evaluar !== null) return informar(evaluar(JSON.parse(readFileSync(op.evaluar, "utf8"))));
  const { crearMotor } = await import("../packages/motor/dist/index.js");
  const img = await imagenes();
  const t0 = performance.now();
  const motor = await crearMotor({ hilos: op.hilos });
  try {
    const primera = await motor.leerDocumento(new Uint8Array(img.amarilla), { fechaReferencia: FECHA }).catch(() => null);
    const frio = Math.round(performance.now() - t0);
    const a = await medir(motor, img.amarilla, img.nuip, op.lecturas);
    const d = await medir(motor, img.digital, img.nuip, op.lecturas);
    const informe = {
      maquina: { cpus: availableParallelism(), memoria_gb: Math.round(totalmem() / 2 ** 30), plataforma: platform(), arquitectura: arch(), node: process.version },
      hilos: op.hilos,
      lecturas: op.lecturas,
      frio_ms: frio,
      p95_amarilla_ms: a.p95,
      p50_amarilla_ms: a.p50,
      p95_digital_ms: d.p95,
      p50_digital_ms: d.p50,
      lecturas_fallidas: a.fallidas + d.fallidas + (primera?.ok === true ? 0 : 1),
      fallos_por_codigo: { amarilla: a.codigos, digital: d.codigos },
      umbrales: UMBRALES,
    };
    const fallos = evaluar(informe);
    process.stdout.write(`${JSON.stringify({ ...informe, fallos }, null, 2)}\n`);
    process.exitCode = fallos.length === 0 ? 0 : 1;
  } finally {
    await motor.cerrar();
  }
}

await principal(process.argv.slice(2));
