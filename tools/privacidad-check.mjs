#!/usr/bin/env node
/**
 * privacidad-check: aplica el principio III de la constitución.
 *
 * Uso:
 *   node tools/privacidad-check.mjs            # revisa todos los archivos versionados y no ignorados
 *   node tools/privacidad-check.mjs --staged   # revisa solo lo que está en el índice (hook de commit)
 *
 * Excepción puntual: añadir en la misma línea `privacidad-ok: <justificación>`.
 * Sale con código 1 si encuentra un hallazgo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXT_MEDIA = /\.(jpe?g|png|webp|heic|heif|bmp|tiff?|gif|mp4|mov|webm|avi)$/i;
const RUTAS_MEDIA_PERMITIDAS = /(^|\/)(sinteticos|especimenes|assets-ui)\//;
const RUTAS_PROHIBIDAS = /(^|\/)(evals\/real|campo|datos-reales)\//;
const RUTAS_IGNORADAS = /^(docs\/investigacion\/|node_modules\/|\.specify\/|\.claude\/skills\/(openspec|speckit)|PLAN\.md$|package-lock\.json$)/;
const ES_TEST = /(^|\/)(test|tests|__tests__)\/|\.test\.[cm]?[jt]s$|_test\.py$|test_.*\.py$/;

/** Reglas por línea: [regex, aplica-a-ruta, mensaje] */
const REGLAS_LINEA = [
  [/cv2\.imwrite|\.save\(\s*["'f]|open\([^)]*["']wb["']|Image\.save|imageio\.imwrite/, /^server\//,
    "persistencia de imagen en el servidor (debe procesarse solo en memoria)"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, /^(packages|apps)\//,
    "almacenamiento en el navegador en código de producto"],
  [/\bwriteFile(Sync)?\s*\(/, /^(packages|apps)\/[^/]+\/src\//,
    "escritura a disco en código de producto"],
  [/(logger|logging|log)\.(debug|info|warning|warn|error|exception|critical)\(.*\b(nuip|cedula|numero|nombre|apellido|fecha_nacimiento|rh|imagen|image)\b/i, /^server\//,
    "log con posible dato personal"],
  [/PubDSK_1/, /^(packages|apps|server)\//,
    "payload PDF417 en código de producto (los fixtures van en evals/fixtures/sinteticos o tests marcados)"],
];

/** OFF-11 (pwa-lectura-offline): la PWA y la captura no persisten nada; sin excepción privacidad-ok. */
const OFF11_RUTAS = /^(apps\/pwa\/src|packages\/capture\/src)\//;
const OFF11_PATRON = /\b(localStorage|sessionStorage|indexedDB)\b|\bdocument\.cookie\b/;
const OFF11_MENSAJE = "OFF-11: almacenamiento del navegador (localStorage, sessionStorage, indexedDB, document.cookie) prohibido en la PWA y la captura";

/**
 * Revisa un archivo y devuelve hallazgos.
 * @param {string} ruta ruta relativa con '/'
 * @param {string|null} contenido texto del archivo, o null si es binario
 * @returns {{ruta: string, linea?: number, mensaje: string}[]}
 */
export function revisarArchivo(ruta, contenido) {
  const r = ruta.replace(/\\/g, "/");
  if (RUTAS_IGNORADAS.test(r)) return [];
  if (RUTAS_PROHIBIDAS.test(r)) {
    return [{ ruta: r, mensaje: "archivo en carpeta de datos reales: nunca debe entrar al repositorio" }];
  }
  if (EXT_MEDIA.test(r)) {
    return RUTAS_MEDIA_PERMITIDAS.test(r)
      ? []
      : [{ ruta: r, mensaje: "imagen o vídeo fuera de carpetas sinteticos/ o especimenes/" }];
  }
  if (contenido == null) return [];

  const hallazgos = [];
  if (/^evals\/fixtures\/.*\.json$/.test(r) && !RUTAS_MEDIA_PERMITIDAS.test(r) && !/"sintetico"\s*:\s*true/.test(contenido)) {
    hallazgos.push({ ruta: r, mensaje: 'fixture JSON sin la marca "sintetico": true' });
  }

  const testMarcado = ES_TEST.test(r) && contenido.includes("fixture-sintetico");
  const lineas = contenido.split(/\r?\n/);
  const off11 = OFF11_RUTAS.test(r) && !ES_TEST.test(r);
  lineas.forEach((texto, i) => {
    if (off11 && OFF11_PATRON.test(texto)) {
      hallazgos.push({ ruta: r, linea: i + 1, mensaje: OFF11_MENSAJE });
      return;
    }
    if (texto.includes("privacidad-ok:")) return;
    for (const [patron, aplica, mensaje] of REGLAS_LINEA) {
      if (!aplica.test(r) || !patron.test(texto)) continue;
      if (testMarcado || (ES_TEST.test(r) && !/PubDSK_1/.test(patron.source))) continue;
      hallazgos.push({ ruta: r, linea: i + 1, mensaje });
    }
  });
  return hallazgos;
}

function listarArchivos(staged) {
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files", "--cached", "--others", "--exclude-standard"];
  return execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

function leer(ruta, staged) {
  if (EXT_MEDIA.test(ruta)) return null;
  try {
    const texto = staged
      ? execFileSync("git", ["show", `:${ruta}`], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 })
      : readFileSync(ruta, "utf8");
    return texto.includes("\u0000") ? null : texto;
  } catch {
    return null;
  }
}

function main(argv) {
  const staged = argv.includes("--staged");
  const hallazgos = listarArchivos(staged).flatMap((ruta) => revisarArchivo(ruta, leer(ruta, staged)));
  if (hallazgos.length > 0) {
    console.error("privacidad-check: infracciones del principio III de la constitución:");
    for (const h of hallazgos) console.error(`  - ${h.ruta}${h.linea ? `:${h.linea}` : ""}: ${h.mensaje}`);
    console.error("Si es un falso positivo, añade en la línea `privacidad-ok: <justificación>`.");
    process.exit(1);
  }
  console.log("privacidad-check: OK");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
