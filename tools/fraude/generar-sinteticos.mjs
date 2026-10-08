#!/usr/bin/env node
/**
 * `npm run fraude:sinteticos` (cambio deteccion-fraude, FRA-13): genera escenas sintéticas de ataques en
 * `evals/sinteticos/fraude/` (no versionado) con un manifiesto `"sintetico": true`.
 *
 * Opciones: --clases a,b  --tipos amarilla,digital  --muestras N (200)  --semilla-inicial S (1)  --frames F (3)
 *           --salida DIR
 * Requiere `npm run build` (usa packages/fraud/dist). Código de salida: 0 bien, 2 argumentos inválidos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ErrorArgumentos, codificarPng, planGeneracion, sha256, validarManifiesto } from "./sinteticos-lib.mjs";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function main() {
  let opciones;
  let plan;
  try {
    ({ values: opciones } = parseArgs({
      options: {
        clases: { type: "string" },
        tipos: { type: "string" },
        muestras: { type: "string" },
        "semilla-inicial": { type: "string" },
        frames: { type: "string" },
        salida: { type: "string" },
      },
    }));
    plan = planGeneracion(opciones);
  } catch (e) {
    console.error(e instanceof ErrorArgumentos || e instanceof TypeError ? e.message : e);
    return 2;
  }
  const { generarEscena } = await import(new URL("../../packages/fraud/dist/sintetico/index.js", import.meta.url).href);
  const salida = resolve(opciones.salida ?? join(RAIZ, "evals", "sinteticos", "fraude"));
  const entradas = [];
  for (const tipo of plan.tipos)
    for (const clase of plan.clases)
      for (let k = 0; k < plan.muestras; k++) {
        const semilla = plan.semillaInicial + k;
        const escena = generarEscena({ tipo, clase, semilla, frames: plan.frames });
        const dir = join(salida, tipo, clase);
        mkdirSync(dir, { recursive: true });
        const archivos = escena.entrada.frames.map((f, i) => {
          const png = codificarPng(f);
          const ruta = join(dir, `${escena.id}-f${i}.png`);
          writeFileSync(ruta, png);
          return { ruta: relative(salida, ruta).split("\\").join("/"), sha256: sha256(png) };
        });
        entradas.push({ id: escena.id, sintetico: true, tipo, clase, semilla, cuadrilatero: escena.entrada.cuadrilatero, archivos });
      }
  const manifiesto = { sintetico: true, generador: "tools/fraude/generar-sinteticos.mjs", plan, entradas };
  const v = validarManifiesto(manifiesto);
  if (!v.ok) {
    console.error(`manifiesto inválido: ${v.motivo}`);
    return 1;
  }
  writeFileSync(join(salida, "manifest.json"), `${JSON.stringify(manifiesto, null, 2)}\n`);
  console.log(`${entradas.length} escenas sintéticas en ${salida}`);
  return 0;
}

process.exitCode = await main();
