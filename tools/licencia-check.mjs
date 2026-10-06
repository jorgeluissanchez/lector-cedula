#!/usr/bin/env node
/**
 * licencia-check: aplica el principio IV de la constitución.
 *
 * Uso:
 *   node tools/licencia-check.mjs                 # revisa dependencias de producción y models/manifest.json
 *   node tools/licencia-check.mjs --package a b   # revisa paquetes npm antes de instalarlos (npm view)
 *   node tools/licencia-check.mjs --pip a b       # revisa nombres de paquetes Python contra la lista negra
 *
 * Sale con código 1 si encuentra una infracción.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PERMITIDAS = new Set([
  "MIT", "MIT-0", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "MPL-2.0",
  "CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "CC-BY-SA-2.5", "CC-BY-SA-4.0", "Unlicense",
  "BlueOak-1.0.0", "Python-2.0", "Zlib", "PSF-2.0",
]);

/** Paquetes o modelos prohibidos por nombre, aunque declaren otra licencia. */
export const LISTA_NEGRA = new Map([
  ["ultralytics", "AGPL-3.0"],
  ["fastmrz", "AGPL-3.0"],
  ["@mrz-scanner/core", "AGPL-3.0 (alsenet mrz-scanner)"],
  ["surya-ocr", "pesos RAIL-M"],
  ["pyiqa", "PolyForm Noncommercial"],
  ["insightface", "packs de modelos no comerciales"],
  ["trufor", "licencia no comercial"],
  ["face-api.js", "abandonado desde 2020"],
  ["easyocr", "sin mantenimiento (constitución: no usar)"],
]);

function partes(expr, separador) {
  return expr.replace(/^\(|\)$/g, "").split(new RegExp(`\\s+${separador}\\s+`, "i")).map((s) => s.trim());
}

/** @returns {{ok: boolean, motivo?: string}} */
export function evaluarLicencia(licencia) {
  if (!licencia || typeof licencia !== "string" || licencia.trim() === "" || licencia === "UNLICENSED") {
    return { ok: false, motivo: "sin licencia declarada" };
  }
  const expr = licencia.trim();
  if (/\s+OR\s+/i.test(expr)) {
    const alguna = partes(expr, "OR").some((p) => evaluarLicencia(p).ok);
    return alguna ? { ok: true } : { ok: false, motivo: `ninguna alternativa permitida en ${expr}` };
  }
  if (/\s+AND\s+/i.test(expr)) {
    const mala = partes(expr, "AND").find((p) => !evaluarLicencia(p).ok);
    return mala ? { ok: false, motivo: `${mala} no permitida dentro de ${expr}` } : { ok: true };
  }
  const limpia = expr.replace(/^\(|\)$/g, "");
  return PERMITIDAS.has(limpia) ? { ok: true } : { ok: false, motivo: `${limpia} no está en la lista permitida` };
}

export function evaluarNombre(nombre) {
  const motivo = LISTA_NEGRA.get(String(nombre).toLowerCase());
  return motivo ? { ok: false, motivo: `${nombre} está prohibido: ${motivo}` } : { ok: true };
}

/** Modelos y datasets declarados en models/manifest.json: [{nombre, licencia, fuente}] */
export function evaluarManifiestoModelos(modelos) {
  return modelos
    .map((m) => {
      const porNombre = evaluarNombre(m.nombre);
      if (!porNombre.ok) return { nombre: m.nombre, motivo: porNombre.motivo };
      const porLic = evaluarLicencia(m.licencia);
      return porLic.ok ? null : { nombre: m.nombre, motivo: porLic.motivo };
    })
    .filter(Boolean);
}

function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

/** Recorre el árbol de dependencias de producción de cada workspace. */
function revisarDependenciasProduccion(raiz) {
  const errores = [];
  const visitados = new Set();
  const pkgRaiz = leerJson(join(raiz, "package.json"));
  const workspaces = (pkgRaiz.workspaces ?? []).flatMap((patron) => {
    const base = patron.replace(/\/\*$/, "");
    const dir = join(raiz, base);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).map((d) => join(dir, d)).filter((d) => existsSync(join(d, "package.json")));
  });

  const pendientes = [];
  for (const ws of workspaces) {
    const pkg = leerJson(join(ws, "package.json"));
    for (const dep of Object.keys(pkg.dependencies ?? {})) pendientes.push({ dep, desde: pkg.name });
  }

  while (pendientes.length > 0) {
    const { dep, desde } = pendientes.pop();
    if (visitados.has(dep)) continue;
    visitados.add(dep);
    const ruta = join(raiz, "node_modules", dep, "package.json");
    if (!existsSync(ruta)) continue; // workspace local o no instalado
    const pkg = leerJson(ruta);
    if (pkg.name?.startsWith("@lector-cedula/")) continue;
    const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
    const porNombre = evaluarNombre(dep);
    const porLic = evaluarLicencia(lic);
    if (!porNombre.ok) errores.push(`${dep} (vía ${desde}): ${porNombre.motivo}`);
    else if (!porLic.ok) errores.push(`${dep}@${pkg.version} (vía ${desde}): ${porLic.motivo}`);
    for (const sub of Object.keys(pkg.dependencies ?? {})) pendientes.push({ dep: sub, desde: dep });
  }
  return errores;
}

function revisarPaqueteRemoto(nombre) {
  const porNombre = evaluarNombre(nombre.replace(/@[^@/]+$/, ""));
  if (!porNombre.ok) return porNombre.motivo;
  // Nombre npm válido, con versión opcional. Evita inyección al pasar por la shell (npm es .cmd en Windows).
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*-]+)?$/i.test(nombre)) {
    return `${nombre}: nombre de paquete no válido`;
  }
  try {
    const lic = execSync(`npm view ${nombre} license`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const r = evaluarLicencia(lic);
    return r.ok ? null : `${nombre}: ${r.motivo}`;
  } catch {
    return `${nombre}: no se pudo consultar la licencia en el registro`;
  }
}

function main(argv) {
  const raiz = resolve(fileURLToPath(new URL("..", import.meta.url)));
  let errores = [];

  if (argv[0] === "--package") {
    errores = argv.slice(1).map(revisarPaqueteRemoto).filter(Boolean);
  } else if (argv[0] === "--pip") {
    errores = argv.slice(1).map((n) => evaluarNombre(n.split(/[=<>~!]/)[0])).filter((r) => !r.ok).map((r) => r.motivo);
  } else {
    errores = revisarDependenciasProduccion(raiz);
    const manifiesto = join(raiz, "models", "manifest.json");
    if (existsSync(manifiesto)) {
      errores.push(...evaluarManifiestoModelos(leerJson(manifiesto)).map((e) => `modelo ${e.nombre}: ${e.motivo}`));
    }
  }

  if (errores.length > 0) {
    console.error("licencia-check: infracciones del principio IV de la constitución:");
    for (const e of errores) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("licencia-check: OK");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
