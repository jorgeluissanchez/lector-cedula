#!/usr/bin/env node
/**
 * `npm run eval:fraude` (cambio deteccion-fraude, FRA-14): genera en memoria escenas sintéticas (semillas
 * held-out, por defecto desde 1001, distintas de las de calibración 1 a 10), evalúa `evaluarFraude` y reporta por
 * documento y especie APCER, BPCER, APCER máxima, BPCER a APCER 5 % y AUC con intervalos de Wilson 95 %.
 * Sale con 1 si una métrica empeora más de 1 punto frente al baseline.
 *
 * Opciones: --muestras N (50)  --semilla-inicial S (1001)  --frames F (3)  --baseline RUTA  --reporte RUTA
 *           --clases a,b  --tipos amarilla,digital
 * Requiere `npm run build`. Escribe `evals/reports/fraude-latest.json` (efímero, no versionado).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compararConBaseline, metricasPorDocumento } from "./metricas-fraude.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLASES = ["autentica", "pantalla", "fotocopia-gris", "fotocopia-color", "impresion", "recortada", "editada"];
/** Meta sintética de Fase A (FRA-14). */
const META = { especies: ["pantalla", "fotocopia-gris", "recortada"], apcerMax: 0.1, bpcer: 0.05 };

function entero(x, def, min, max) {
  if (x === undefined) return def;
  const n = Number(x);
  if (!Number.isInteger(n) || n < min || n > max) throw new TypeError(`valor inválido: ${x}`);
  return n;
}

async function main() {
  let o;
  try {
    ({ values: o } = parseArgs({
      options: {
        muestras: { type: "string" },
        "semilla-inicial": { type: "string" },
        frames: { type: "string" },
        baseline: { type: "string" },
        reporte: { type: "string" },
        clases: { type: "string" },
        tipos: { type: "string" },
      },
    }));
    o.muestras = entero(o.muestras, 50, 1, 100_000);
    o.semilla = entero(o["semilla-inicial"], 1001, 0, 2 ** 31);
    o.frames = entero(o.frames, 3, 1, 5);
    o.clases = o.clases === undefined ? CLASES : o.clases.split(",");
    o.tipos = o.tipos === undefined ? ["amarilla", "digital"] : o.tipos.split(",");
    if (o.clases.some((c) => !CLASES.includes(c)) || o.tipos.some((t) => t !== "amarilla" && t !== "digital")) throw new TypeError("clase o tipo inválido");
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const fraude = await import(new URL("../../../packages/fraud/dist/index.js", import.meta.url).href);
  const { generarEscena } = await import(new URL("../../../packages/fraud/dist/sintetico/index.js", import.meta.url).href);
  const umbral = fraude.CONFIG_FRAUDE_POR_DEFECTO.umbralMedio;
  const filas = [];
  const tiempos = [];
  for (const tipo of o.tipos)
    for (const clase of o.clases)
      for (let k = 0; k < o.muestras; k++) {
        const escena = generarEscena({ tipo, clase, semilla: o.semilla + k, frames: o.frames });
        const t0 = performance.now();
        const s = fraude.evaluarFraude(escena.entrada);
        tiempos.push(performance.now() - t0);
        filas.push({ tipo, clase, puntaje: s.puntaje });
      }
  tiempos.sort((a, b) => a - b);
  const documentos = metricasPorDocumento(filas, umbral);
  const reporte = {
    version: 1,
    sintetico: true,
    umbral,
    muestrasPorClase: o.muestras,
    semillaInicial: o.semilla,
    p95MsNode: Math.round(tiempos[Math.floor(tiempos.length * 0.95)] ?? 0),
    documentos,
  };
  const rutaReporte = resolve(o.reporte ?? join(RAIZ, "evals", "reports", "fraude-latest.json"));
  mkdirSync(dirname(rutaReporte), { recursive: true });
  writeFileSync(rutaReporte, `${JSON.stringify(reporte, null, 2)}\n`);

  for (const [tipo, d] of Object.entries(documentos)) {
    console.log(`${tipo}: BPCER ${d.bpcer} APCERmax ${d.apcerMax} BPCER@APCER5% ${d.bpcerApcer5} AUC ${d.auc}`);
    for (const [e, m] of Object.entries(d.especies)) console.log(`  ${e}: APCER ${m.apcer} IC95 [${m.ic.join(", ")}]`);
    const max = Math.max(0, ...META.especies.filter((e) => d.especies[e]).map((e) => d.especies[e].apcer));
    console.log(`  meta Fase A (APCER max <= 10 % con BPCER <= 5 % en ${META.especies.join(", ")}): ${max <= META.apcerMax && d.bpcer <= META.bpcer ? "cumple" : "no cumple"}`);
  }
  console.log(`p95 Node: ${reporte.p95MsNode} ms`);

  const rutaBaseline = resolve(o.baseline ?? join(RAIZ, "evals", "reports", "baseline-fraude.json"));
  if (!existsSync(rutaBaseline)) {
    console.log(`sin baseline en ${rutaBaseline}: no se compara`);
    return 0;
  }
  const regresiones = compararConBaseline(reporte, JSON.parse(readFileSync(rutaBaseline, "utf8")));
  for (const r of regresiones) console.error(`regresión: ${r}`);
  return regresiones.length > 0 ? 1 : 0;
}

process.exitCode = await main();
