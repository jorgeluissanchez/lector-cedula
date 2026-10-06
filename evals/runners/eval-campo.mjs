#!/usr/bin/env node
/**
 * eval-campo: corre los fixtures de evals/fixtures contra los parsers y mide exact match y CER por
 * campo. Compara con evals/reports/baseline.json y sale con código 1 si hay regresión.
 *
 * Uso:
 *   node evals/runners/eval-campo.mjs                    # todos los fixtures
 *   node evals/runners/eval-campo.mjs --quick            # solo fixtures sintéticos rápidos
 *   node evals/runners/eval-campo.mjs --guardar-baseline # fija el resultado actual como baseline
 *
 * Formato de fixture (JSON): {"sintetico": true, "tipo": "<evaluador>", "entrada": ..., "esperado": {...}}
 * Los evaluadores se registran en evals/runners/registro.mjs.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agregar, regresiones } from "./metricas.mjs";
import { EVALUADORES } from "./registro.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURES = join(RAIZ, "evals", "fixtures");
const REPORTES = join(RAIZ, "evals", "reports");

function listarJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return listarJson(p);
    return n.endsWith(".json") ? [p] : [];
  });
}

async function cargarEvaluador(tipo) {
  const def = EVALUADORES[tipo];
  if (!def) throw new Error(`No hay evaluador registrado para el tipo "${tipo}" en registro.mjs`);
  const mod = await import(pathToFileURL(join(RAIZ, def.modulo)).href);
  const fn = mod[def.exportar];
  if (typeof fn !== "function") throw new Error(`${def.modulo} no exporta la función ${def.exportar}`);
  return (entrada) => (def.adaptar ? def.adaptar(fn(entrada)) : fn(entrada));
}

async function main(argv) {
  const rapido = argv.includes("--quick");
  const archivos = listarJson(FIXTURES).filter((p) => !rapido || /[\\/]sinteticos[\\/]/.test(p) || !/[\\/]lentos[\\/]/.test(p));
  const fixtures = archivos.map((p) => ({ ruta: p, ...JSON.parse(readFileSync(p, "utf8")) }));

  const sinMarca = fixtures.filter((f) => f.sintetico !== true);
  if (sinMarca.length > 0) {
    console.error(`eval-campo: ${sinMarca.length} fixtures sin "sintetico": true (principio III). Primero: ${sinMarca[0].ruta}`);
    process.exit(1);
  }

  if (fixtures.length > 0) execSync("npx tsc -b", { cwd: RAIZ, stdio: "inherit" });

  const casos = [];
  const errores = [];
  const cache = new Map();
  for (const f of fixtures) {
    if (!cache.has(f.tipo)) cache.set(f.tipo, await cargarEvaluador(f.tipo));
    let obtenido;
    try {
      obtenido = cache.get(f.tipo)(f.entrada);
    } catch (e) {
      errores.push(`${f.ruta}: ${e.message}`);
      obtenido = {};
    }
    casos.push({ tipo: f.tipo, esperado: f.esperado, obtenido });
  }

  const metricas = agregar(casos);
  const reporte = { fecha: new Date().toISOString(), modo: rapido ? "quick" : "completo", casos: casos.length, excepciones: errores, metricas };
  mkdirSync(REPORTES, { recursive: true });
  writeFileSync(join(REPORTES, "latest.json"), `${JSON.stringify(reporte, null, 2)}\n`);

  for (const [tipo, campos] of Object.entries(metricas)) {
    console.log(`\n${tipo}`);
    for (const [campo, m] of Object.entries(campos)) {
      console.log(`  ${campo.padEnd(22)} n=${String(m.n).padStart(4)}  exact=${(m.exact_match * 100).toFixed(1).padStart(5)}%  CER=${(m.cer * 100).toFixed(2)}%`);
    }
  }
  console.log(`\neval-campo: ${casos.length} casos, ${errores.length} excepciones.`);

  const rutaBaseline = join(REPORTES, "baseline.json");
  if (argv.includes("--guardar-baseline")) {
    writeFileSync(rutaBaseline, `${JSON.stringify({ fecha: reporte.fecha, metricas }, null, 2)}\n`);
    console.log("Baseline actualizado.");
    return;
  }
  const baseline = existsSync(rutaBaseline) ? JSON.parse(readFileSync(rutaBaseline, "utf8")).metricas : {};
  const r = regresiones(metricas, baseline);
  if (r.length > 0 || errores.length > 0) {
    console.error("\nRegresiones frente al baseline:");
    for (const x of [...r, ...errores]) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log("Sin regresiones frente al baseline.");
}

await main(process.argv.slice(2));
