#!/usr/bin/env node
/**
 * eval-campo: corre los fixtures de evals/fixtures contra los parsers y mide exact match y CER por
 * campo. Compara con evals/reports/baseline.json y sale con código 1 si hay regresión.
 *
 * Uso:
 *   node evals/runners/eval-campo.mjs                    # todos los fixtures
 *   node evals/runners/eval-campo.mjs --quick            # solo fixtures sintéticos rápidos
 *   node evals/runners/eval-campo.mjs --guardar-baseline # fija el resultado actual como baseline (registra el modo)
 *   node evals/runners/eval-campo.mjs --fixtures <dir>   # lee fixtures solo de <dir> y sus subdirectorios (EV-04)
 *   node evals/runners/eval-campo.mjs --reportes <dir>   # lee baseline.json y escribe latest.json (y el baseline) en <dir> (EV-04)
 * Las rutas de --fixtures y --reportes se resuelven desde el directorio de trabajo. Sin ellas se usan
 * evals/fixtures y evals/reports. Un directorio de fixtures inexistente sale con código 1.
 *
 * Regresión (código 1): un campo que desaparece, una caída de exact match, una subida de CER o una caída
 * de n frente al baseline (EV-03, se perdieron fixtures). La caída de n solo se compara si el baseline se
 * guardó en el mismo modo (quick o completo) o no registra modo (falta o es null).
 *
 * Formato de fixture (JSON): {"sintetico": true, "tipo": "<evaluador>", "entrada": ..., "opciones"?: {...}, "esperado": {...},
 *   "clavesExactas"?: true}
 * Con "clavesExactas": true (solo el booleano) se mide además el campo __claves: el conjunto de claves del
 * resultado debe ser igual al de "esperado" (EV-01). "__claves" es un nombre reservado y no puede aparecer en
 * "esperado" (EV-02). Un "esperado" ausente, null, array o que no es objeto detiene el corredor con código 1
 * antes de evaluar ningún caso (EV-05).
 * Los evaluadores se registran en evals/runners/registro.mjs.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agregar, construirCasos, mismoModo, regresiones, validarEsperados } from "./metricas.mjs";
import { EVALUADORES } from "./registro.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURES = join(RAIZ, "evals", "fixtures");
const REPORTES = join(RAIZ, "evals", "reports");

/** Valor de una bandera `--x <valor>`, resuelto como ruta; `porDefecto` si la bandera no está (EV-04). */
function rutaDeBandera(argv, bandera, porDefecto) {
  const i = argv.indexOf(bandera);
  if (i === -1) return porDefecto;
  const valor = argv[i + 1];
  if (valor === undefined || valor.startsWith("--")) throw new Error(`falta el directorio tras ${bandera}`);
  return resolve(valor);
}

function listarJson(dir) {
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
  return (entrada, opciones) => {
    const r = opciones === undefined ? fn(entrada) : fn(entrada, opciones);
    return def.adaptar ? def.adaptar(r) : r;
  };
}

async function main(argv) {
  const rapido = argv.includes("--quick");
  const dirFixtures = rutaDeBandera(argv, "--fixtures", FIXTURES);
  const dirReportes = rutaDeBandera(argv, "--reportes", REPORTES);
  if (!existsSync(dirFixtures) || !statSync(dirFixtures).isDirectory()) {
    throw new Error(`el directorio de fixtures no existe: ${dirFixtures}`);
  }

  // El filtro de --quick mira la ruta relativa al directorio de fixtures, no la de sus padres.
  const archivos = listarJson(dirFixtures).filter((p) => {
    const rel = relative(dirFixtures, p);
    return !rapido || /(^|[\\/])sinteticos[\\/]/.test(rel) || !/(^|[\\/])lentos[\\/]/.test(rel);
  });
  const fixtures = archivos.map((p) => ({ ruta: p, ...JSON.parse(readFileSync(p, "utf8")) }));

  const sinMarca = fixtures.filter((f) => f.sintetico !== true);
  if (sinMarca.length > 0) {
    console.error(`eval-campo: ${sinMarca.length} fixtures sin "sintetico": true (principio III). Primero: ${sinMarca[0].ruta}`);
    process.exit(1);
  }

  // EV-05: un esperado inválido detiene el corredor antes de compilar y de evaluar ningún caso.
  validarEsperados(fixtures);

  if (fixtures.length > 0) execSync("npx tsc -b", { cwd: RAIZ, stdio: "inherit" });

  const evaluadores = new Map();
  for (const tipo of new Set(fixtures.map((f) => f.tipo))) evaluadores.set(tipo, await cargarEvaluador(tipo));
  const { casos, errores } = construirCasos(fixtures, (tipo, entrada, opciones) => evaluadores.get(tipo)(entrada, opciones));

  const metricas = agregar(casos);
  const reporte = { fecha: new Date().toISOString(), modo: rapido ? "quick" : "completo", casos: casos.length, excepciones: errores, metricas };
  mkdirSync(dirReportes, { recursive: true });
  writeFileSync(join(dirReportes, "latest.json"), `${JSON.stringify(reporte, null, 2)}\n`);

  for (const [tipo, campos] of Object.entries(metricas)) {
    console.log(`\n${tipo}`);
    for (const [campo, m] of Object.entries(campos)) {
      console.log(`  ${campo.padEnd(22)} n=${String(m.n).padStart(4)}  exact=${(m.exact_match * 100).toFixed(1).padStart(5)}%  CER=${(m.cer * 100).toFixed(2)}%`);
    }
  }
  console.log(`\neval-campo: ${casos.length} casos, ${errores.length} excepciones.`);

  const rutaBaseline = join(dirReportes, "baseline.json");
  if (argv.includes("--guardar-baseline")) {
    writeFileSync(rutaBaseline, `${JSON.stringify({ fecha: reporte.fecha, modo: reporte.modo, metricas }, null, 2)}\n`);
    console.log("Baseline actualizado.");
    return;
  }
  const baseline = existsSync(rutaBaseline) ? JSON.parse(readFileSync(rutaBaseline, "utf8")) : {};
  const r = regresiones(metricas, baseline.metricas, { compararN: mismoModo(baseline.modo, reporte.modo) });
  if (r.length > 0 || errores.length > 0) {
    console.error("\nRegresiones frente al baseline:");
    for (const x of [...r, ...errores]) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log("Sin regresiones frente al baseline.");
}

try {
  await main(process.argv.slice(2));
} catch (e) {
  console.error(`eval-campo: ${e.message}`);
  process.exit(1);
}
