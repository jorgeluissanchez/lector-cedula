#!/usr/bin/env node
/**
 * licencia-check: aplica el principio IV de la constitución.
 *
 * Uso:
 *   node tools/licencia-check.mjs                 # dependencias de producción, models/manifest.json, avisos CC BY-SA (DC-12)
 *                                                 # y licencias del tarball de @lector-cedula/web (SDK-26)
 *   node tools/licencia-check.mjs --package a b   # revisa paquetes npm antes de instalarlos (npm view)
 *   node tools/licencia-check.mjs --pip a b       # revisa nombres de paquetes Python contra la lista negra
 *
 * Sale con código 1 si encuentra una infracción.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
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

// DC-12 (divipol-consulados-2018): todo artefacto o consumidor de datos CC BY-SA lleva su aviso.
export const CODIGO_LEGAL_CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.es";

/** Regla 1: el paquete de un `*.generated.ts` con datos CC BY-SA declara y distribuye su aviso. */
export function evaluarArtefactoCcBySa({ artefacto, paquete, avisos }) {
  const motivos = [];
  if (!String(paquete?.license ?? "").includes("CC-BY-SA-4.0")) motivos.push("license sin CC-BY-SA-4.0");
  if (!(paquete?.files ?? []).includes("THIRD_PARTY_NOTICES.md")) motivos.push("files sin THIRD_PARTY_NOTICES.md");
  if (typeof avisos !== "string") motivos.push("falta THIRD_PARTY_NOTICES.md");
  else {
    if (!avisos.includes(artefacto)) motivos.push("THIRD_PARTY_NOTICES.md no lo nombra");
    if (!avisos.includes(CODIGO_LEGAL_CC_BY_SA)) motivos.push(`THIRD_PARTY_NOTICES.md sin ${CODIGO_LEGAL_CC_BY_SA}`);
  }
  return motivos.length === 0 ? [] : [`${artefacto} (${paquete?.name ?? "?"}): datos CC BY-SA sin aviso: ${motivos.join("; ")}`];
}

const IMPORTA_CC_BY_SA = /\bconLugarNacimiento\b|["'][^"']*(?:divipola|divipol-2018|lectura\/lugar)[^"']*["']/u;

/** Regla 2: un script que usa datos CC BY-SA contiene el literal `CC BY-SA 4.0`. */
export function evaluarConsumidorCcBySa(ruta, contenido) {
  if (!IMPORTA_CC_BY_SA.test(contenido) || contenido.includes("CC BY-SA 4.0")) return null;
  return `${ruta}: usa datos CC BY-SA sin el aviso "CC BY-SA 4.0"`;
}

/** Regla 3: una imagen que compila packages/parsers/src copia sus avisos a /srv/licencias/. */
export function evaluarDockerfileAvisos(contenido) {
  if (!contenido.includes("packages/parsers/src")) return null;
  const copia = contenido.split("\n").some((l) => /^\s*COPY\b/u.test(l) && l.includes("THIRD_PARTY_NOTICES") && l.includes("/srv/licencias/"));
  return copia ? null : "server/Dockerfile: compila packages/parsers/src sin copiar THIRD_PARTY_NOTICES a /srv/licencias/";
}

function archivosRecursivos(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    return e.isDirectory() ? archivosRecursivos(ruta) : [ruta];
  });
}

/** Aplica las tres reglas de DC-12 al repositorio. */
export function revisarAvisosCcBySa(raiz) {
  const errores = [];
  const dirPaquetes = join(raiz, "packages");
  for (const nombre of existsSync(dirPaquetes) ? readdirSync(dirPaquetes) : []) {
    const dir = join(dirPaquetes, nombre);
    if (!existsSync(join(dir, "package.json"))) continue;
    const generados = archivosRecursivos(join(dir, "src")).filter((r) => r.endsWith(".generated.ts") && readFileSync(r, "utf8").includes("CC-BY-SA"));
    if (generados.length === 0) continue;
    const paquete = leerJson(join(dir, "package.json"));
    const rutaAvisos = join(dir, "THIRD_PARTY_NOTICES.md");
    const avisos = existsSync(rutaAvisos) ? readFileSync(rutaAvisos, "utf8") : null;
    for (const g of generados) {
      const artefacto = relative(dir, g).split(sep).join("/");
      errores.push(...evaluarArtefactoCcBySa({ artefacto, paquete, avisos }));
    }
  }
  const scripts = [
    ...(existsSync(join(raiz, "tools")) ? readdirSync(join(raiz, "tools")).map((n) => join(raiz, "tools", n)) : []),
    ...archivosRecursivos(join(raiz, "server")),
  ].filter((r) => r.endsWith(".mjs"));
  for (const s of scripts) {
    const e = evaluarConsumidorCcBySa(relative(raiz, s).split(sep).join("/"), readFileSync(s, "utf8"));
    if (e) errores.push(e);
  }
  const dockerfile = join(raiz, "server", "Dockerfile");
  if (existsSync(dockerfile)) {
    const e = evaluarDockerfileAvisos(readFileSync(dockerfile, "utf8"));
    if (e) errores.push(e);
  }
  return errores;
}

// SDK-26 (sdk-integracion): el tarball publicado lleva la licencia propia y los avisos de terceros en su raíz.
export const LICENCIAS_TARBALL = ["LICENSE", "THIRD_PARTY_LICENSES.txt"];

/** Infracciones de una lista de rutas de `npm pack --dry-run --json` (rutas relativas al paquete). */
export function evaluarTarballLicencias(nombre, rutas) {
  const presentes = new Set(rutas);
  return LICENCIAS_TARBALL.filter((f) => !presentes.has(f)).map((f) => `${nombre}: el tarball (npm pack --dry-run) no contiene ${f}`);
}

/** Corre `npm pack --dry-run --json --ignore-scripts` en packages/web y evalúa su lista. */
export function revisarTarballWeb(raiz) {
  const dir = join(raiz, "packages", "web");
  if (!existsSync(join(dir, "package.json"))) return [];
  try {
    const salida = execSync("npm pack --dry-run --json --ignore-scripts", { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const rutas = (JSON.parse(salida)[0]?.files ?? []).map((f) => f.path);
    return evaluarTarballLicencias("@lector-cedula/web", rutas);
  } catch {
    return ["@lector-cedula/web: no se pudo ejecutar npm pack --dry-run"];
  }
}

// NAT-16 (sdk-nativo): dependencias nativas. Gradle y SwiftPM no publican la licencia en un campo como npm, así que cada
// dependencia directa (build.gradle.kts), resuelta (informe `gradle dependencies` en build/) o fijada (Package.resolved)
// se busca en el registro `native/licencias-nativas.json`, mantenido con revisor-licencias.
export const REGISTRO_NATIVO = "native/licencias-nativas.json";

/** Configuraciones de Gradle que no llegan al artefacto publicado. */
const CONFIGURACIONES_PRUEBA = /^(test|androidTest|testFixtures|kapt[A-Z]?.*Test|pitest|lint|detekt|ktlint)/;
/** Configuraciones que no se distribuyen pero se usan al compilar (herramientas). */
const CONFIGURACIONES_HERRAMIENTA = /^(compileOnly|annotationProcessor|kapt|ksp|classpath|plugin)$/;

/** `[{ configuracion, coordenada }]` de las dependencias declaradas como cadena `grupo:artefacto[:versión]`. */
export function dependenciasDeGradle(contenido) {
  const deps = [];
  for (const linea of String(contenido).split(/\r?\n/)) {
    const sinComentario = linea.replace(/\/\/.*$/, "");
    const m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*\(\s*(?:(?:platform|enforcedPlatform)\s*\(\s*)?"([^":\s]+):([^":\s]+)(?::[^"]*)?"/.exec(sinComentario);
    if (m) deps.push({ configuracion: m[1], coordenada: `${m[2]}:${m[3]}` });
  }
  return deps;
}

/** Coordenadas `grupo:artefacto` únicas del informe de texto de `gradle dependencies`. */
export function coordenadasDeInformeGradle(texto) {
  const vistas = new Set();
  for (const linea of String(texto).split(/\r?\n/)) {
    const m = /^[\s|+\\-]*[+\\]---\s+([^\s:()]+):([^\s:()]+):\S+/.exec(linea);
    if (m) vistas.add(`${m[1]}:${m[2]}`);
  }
  return [...vistas];
}

/** Identidades de los pins de un `Package.resolved` (v1, v2 o v3), o `null` si no es JSON válido. */
export function dependenciasDeSwiftPm(contenido) {
  try {
    const j = JSON.parse(contenido);
    const pins = j.pins ?? j.object?.pins ?? [];
    return pins.map((p) => String(p.identity ?? p.package ?? "").toLowerCase()).filter(Boolean);
  } catch {
    return null;
  }
}

function ambitoDe(configuracion) {
  if (CONFIGURACIONES_PRUEBA.test(configuracion)) return "prueba";
  if (CONFIGURACIONES_HERRAMIENTA.test(configuracion)) return "herramienta";
  return "produccion";
}

/**
 * Infracciones de `[{ origen, tipo: "gradle"|"swiftpm", configuracion, coordenada }]` frente al registro
 * `{ gradle: { coord: { licencia, ambito, justificacion? } }, swiftpm: {...} }`. Producción: licencia permitida.
 * Prueba o herramienta: licencia permitida o, si no, entrada registrada con ese ámbito y justificación.
 */
export function evaluarDependenciasNativas(deps, registro) {
  const errores = [];
  for (const d of deps) {
    const nombre = d.coordenada.split(":").at(-1);
    const porNombre = evaluarNombre(nombre);
    if (!porNombre.ok) {
      errores.push(`${d.origen}: ${d.coordenada}: ${porNombre.motivo}`);
      continue;
    }
    const entrada = registro?.[d.tipo]?.[d.coordenada];
    if (entrada === undefined) {
      errores.push(`${d.origen}: ${d.coordenada} (${d.configuracion}) sin licencia registrada en ${REGISTRO_NATIVO}`);
      continue;
    }
    if (evaluarLicencia(entrada.licencia).ok) continue;
    const ambito = d.tipo === "swiftpm" ? "produccion" : ambitoDe(d.configuracion);
    if (ambito === "produccion") {
      errores.push(`${d.origen}: ${d.coordenada} (${d.configuracion}): ${entrada.licencia} no permitida en producción`);
    } else if (entrada.ambito !== ambito && !(ambito === "herramienta" && entrada.ambito === "prueba")) {
      errores.push(`${d.origen}: ${d.coordenada} (${d.configuracion}): ${entrada.licencia} registrada como ${entrada.ambito ?? "?"}, usada como ${ambito}`);
    } else if (typeof entrada.justificacion !== "string" || entrada.justificacion.trim() === "") {
      errores.push(`${d.origen}: ${d.coordenada}: ${entrada.licencia} fuera de la lista exige una justificación en ${REGISTRO_NATIVO}`);
    }
  }
  return errores;
}

function archivosNativos(dir, filtro) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name === ".gradle" || e.name === ".build" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "build" ? archivosNativos(ruta, (r) => r.endsWith("dependencias-resueltas.txt")) : archivosNativos(ruta, filtro);
    return filtro(ruta) ? [ruta] : [];
  });
}

/** Revisa `native/` bajo `raiz`: build.gradle.kts, informes resueltos de producción y Package.resolved. */
export function revisarLicenciasNativas(raiz) {
  const dirNativo = join(raiz, "native");
  if (!existsSync(dirNativo)) return [];
  const rutaRegistro = join(raiz, REGISTRO_NATIVO);
  const registro = existsSync(rutaRegistro) ? leerJson(rutaRegistro) : {};
  const rel = (r) => relative(raiz, r).split(sep).join("/");
  const deps = [];
  for (const r of archivosNativos(dirNativo, (r) => r.endsWith(".gradle.kts") || r.endsWith("Package.resolved"))) {
    const contenido = readFileSync(r, "utf8");
    if (r.endsWith("dependencias-resueltas.txt")) {
      // Informe de `releaseRuntimeClasspath`: todo lo resuelto se distribuye en el AAR.
      for (const c of coordenadasDeInformeGradle(contenido)) deps.push({ origen: rel(r), tipo: "gradle", configuracion: "releaseRuntimeClasspath", coordenada: c });
    } else if (r.endsWith("Package.resolved")) {
      const pins = dependenciasDeSwiftPm(contenido);
      if (pins === null) deps.push({ origen: rel(r), tipo: "swiftpm", configuracion: "produccion", coordenada: "Package.resolved ilegible" });
      else for (const p of pins) deps.push({ origen: rel(r), tipo: "swiftpm", configuracion: "produccion", coordenada: p });
    } else {
      for (const d of dependenciasDeGradle(contenido)) deps.push({ origen: rel(r), tipo: "gradle", ...d });
    }
  }
  return evaluarDependenciasNativas(deps, registro);
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

/**
 * Licencias distintas en la salida de `npm view <spec> license`. Con una versión exacta es la licencia sola;
 * con un rango (`fastify@^5`) es una línea `nombre@versión 'LICENCIA'` por versión.
 */
export function licenciasDeNpmView(salida) {
  const lineas = String(salida).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const licencias = lineas.map((l) => {
    const m = /^\S+@\S+\s+'(.*)'$/.exec(l);
    return m ? m[1] : l;
  });
  return [...new Set(licencias)];
}

function revisarPaqueteRemoto(nombre) {
  const porNombre = evaluarNombre(nombre.replace(/@[^@/]+$/, ""));
  if (!porNombre.ok) return porNombre.motivo;
  // Nombre npm válido, con versión opcional. Evita inyección al pasar por la shell (npm es .cmd en Windows).
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.^~<>=*-]+)?$/i.test(nombre)) {
    return `${nombre}: nombre de paquete no válido`;
  }
  try {
    // Entre comillas dobles: ni cmd (^, <, >) ni sh interpretan los caracteres del rango.
    const salida = execSync(`npm view "${nombre}" license`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const licencias = licenciasDeNpmView(salida);
    if (licencias.length === 0) return `${nombre}: el registro no declara licencia`;
    const malas = licencias.map(evaluarLicencia).filter((r) => !r.ok);
    return malas.length === 0 ? null : `${nombre}: ${malas.map((r) => r.motivo).join("; ")}`;
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
  } else if (argv[0] === "--solo-nativo") {
    // NAT-16: solo las dependencias nativas, opcionalmente de otra raíz (`--raiz <dir>`, para fixtures).
    const i = argv.indexOf("--raiz");
    errores = revisarLicenciasNativas(i >= 0 ? resolve(argv[i + 1]) : raiz);
  } else {
    errores = revisarDependenciasProduccion(raiz);
    errores.push(...revisarLicenciasNativas(raiz));
    errores.push(...revisarAvisosCcBySa(raiz));
    errores.push(...revisarTarballWeb(raiz));
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
