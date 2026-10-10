#!/usr/bin/env node
// Resumen de PIT repartido en varios jobs (sdk-nativo, tarea 1.3; `KM` en CI): suma los `mutations.xml` de cada
// fragmento (clases disjuntas) y calcula la puntuación global como PIT: detectados / total, donde detectados son
// KILLED, TIMED_OUT, MEMORY_ERROR y RUN_ERROR, y no detectados SURVIVED y NO_COVERAGE.
// Uso: node tools/pit-resumen.mjs <dir> [--umbral 85]  (busca mutations.xml recursivamente en <dir>)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DETECTADOS = new Set(["KILLED", "TIMED_OUT", "MEMORY_ERROR", "RUN_ERROR"]);

/** Mutantes de un mutations.xml: estado, clase, método, línea y mutador. */
export function leerMutantes(xml) {
  const r = [];
  for (const m of xml.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/gu)) {
    const atributos = m[1] ?? "";
    const cuerpo = m[2] ?? "";
    const estado = /\bstatus=['"]([A-Z_]+)['"]/u.exec(atributos)?.[1];
    if (!estado) throw new Error("mutations.xml sin status");
    const campo = (n) => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`, "u").exec(cuerpo)?.[1] ?? "";
    r.push({ estado, clase: campo("mutatedClass"), metodo: campo("mutatedMethod"), linea: Number(campo("lineNumber")), mutador: campo("mutator").replace(/^.*\./u, "") });
  }
  return r;
}

/** Totales de una lista de mutantes. `puntuacion` en porcentaje con un decimal (0 si no hay mutantes). */
export function resumir(mutantes) {
  const total = mutantes.length;
  const detectados = mutantes.filter((m) => DETECTADOS.has(m.estado)).length;
  const porClase = {};
  for (const m of mutantes) {
    const c = (porClase[m.clase] ??= { total: 0, detectados: 0 });
    c.total++;
    if (DETECTADOS.has(m.estado)) c.detectados++;
  }
  return { total, detectados, puntuacion: total === 0 ? 0 : Math.round((1000 * detectados) / total) / 10, porClase };
}

function buscar(dir) {
  const r = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) r.push(...buscar(p));
    else if (n === "mutations.xml") r.push(p);
  }
  return r;
}

function main(args) {
  const dir = args[0];
  const i = args.indexOf("--umbral");
  const umbral = i >= 0 ? Number(args[i + 1]) : 85;
  if (!dir) throw new Error("uso: node tools/pit-resumen.mjs <dir> [--umbral 85]");
  const mutantes = buscar(resolve(dir)).flatMap((f) => leerMutantes(readFileSync(f, "utf8")));
  const r = resumir(mutantes);
  for (const [clase, c] of Object.entries(r.porClase).sort()) process.stdout.write(`${clase}: ${c.detectados}/${c.total}\n`);
  for (const m of mutantes.filter((x) => !DETECTADOS.has(x.estado))) process.stdout.write(`  ${m.estado} ${m.clase}.${m.metodo}:${m.linea} ${m.mutador}\n`);
  process.stdout.write(`PIT: ${r.detectados}/${r.total} = ${r.puntuacion} % (umbral ${umbral} %)\n`);
  if (r.total === 0 || r.puntuacion < umbral) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
