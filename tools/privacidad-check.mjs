#!/usr/bin/env node
/**
 * privacidad-check: aplica el principio III de la constitución.
 *
 * Uso:
 *   node tools/privacidad-check.mjs            # revisa todos los archivos versionados y no ignorados
 *   node tools/privacidad-check.mjs --staged   # revisa solo lo que está en el índice (hook de commit)
 *   node tools/privacidad-check.mjs --raiz <dir>  # revisa todos los archivos de un directorio, sin git
 *
 * Excepción puntual: añadir en la misma línea `privacidad-ok: <justificación>`.
 * Sale con código 1 si encuentra un hallazgo.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
 * NAT-13 (sdk-nativo): el núcleo nativo (Kotlin y Swift fuera de pruebas) no persiste imágenes, frames ni resultados
 * (disco, caché, SharedPreferences, DataStore, UserDefaults, galería) ni escribe en logs; sin excepción privacidad-ok.
 */
const NATIVO_RUTAS = /^native\/.*\.(kt|swift)$/;
const NATIVO_PRUEBA = /(^|\/)(test|androidTest|testFixtures|Tests|[A-Za-z]+Tests)\//;
const NATIVO_REGLAS = [
  [/\b(getSharedPreferences|SharedPreferences|EncryptedSharedPreferences|dataStore|DataStore|openFileOutput|FileOutputStream|MediaStore|cacheDir|filesDir|externalCacheDir|writeBytes|writeText|RandomAccessFile)\b|\.compress\(\s*Bitmap\.CompressFormat/,
    "NAT-13: persistencia en el núcleo nativo (archivos, caché, SharedPreferences, DataStore o galería)"],
  [/\b(UserDefaults|NSUserDefaults|PHPhotoLibrary|UIImageWriteToSavedPhotosAlbum|NSKeyedArchiver)\b|\.write\(\s*to:|FileManager\.default\.createFile|\.createFile\(atPath:/,
    "NAT-13: persistencia en el núcleo nativo (archivos, UserDefaults o galería)"],
  [/\bLog\.(v|d|i|w|e|wtf)\(|\bprintln\(|(^|[^.\w])print\(|\bNSLog\(|\bos_log\(|\bLogger\(|\bTimber\./,
    "NAT-13: log en el núcleo nativo (puede filtrar datos del documento)"],
];
/** NAT-13: el manifiesto de la librería Android no declara INTERNET (lo añade el integrador si usa `servidor`). */
const MANIFIESTO_LIBRERIA = /^native\/android\/.*\/src\/main\/AndroidManifest\.xml$/;

/**
 * OD-40 (otros-documentos): ningún paquete de producto (apps/* y packages/*) depende de una librería que decodifique QR,
 * lea códigos de barras con un motor de terceros (ZXing JS, ZBar, BarcodeDetector, ML Kit, Quagga) o lea chips NFC
 * (ni BAC/PACE). zxing-wasm es la única excepción, por su nombre exacto: lee el PDF417 y el QR de la digital nunca se
 * decodifica.
 */
const PAQUETE_PRODUCTO = /^(apps|packages)\/[^/]+\/package\.json$/;
const SECCIONES_DEPENDENCIAS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const DEPENDENCIA_PERMITIDA = new Set(["zxing-wasm"]);
const DEPENDENCIA_PROHIBIDA = [
  /^jsqr(-es6)?$/,
  /html5-qrcode/i,
  /qr(code)?[-_]?(scanner|reader|decoder|scan|decode)/i,
  /(^|[^a-z])nfc([^a-z]|$)/i,
  /(^|[/@-])(j|e)?mrtd([/-]|$)|epassport/i,
  /^@zxing\/|zxing/i,
  /zbar/i,
  /^barcode-detector$/,
  /ml-?kit.*barcode|barcode-scanning/i,
  /^@ericblade\/quagga|quagga/i,
];

/** OD-40: tampoco el núcleo nativo (Gradle) ni sus manifiestos (permiso NFC). */
const GRADLE_NATIVO = /^native\/.*build\.gradle\.kts$/;
const GRADLE_PROHIBIDO = /com\.google\.mlkit:barcode-scanning|mlkit[-_.:]?barcode|barcode-scanning|com\.google\.zxing|zxing|zbar|(^|[^a-z])nfc([^a-z]|$)|mrtd/i;
const MANIFIESTO_NATIVO = /^native\/.*AndroidManifest\.xml$/;

/**
 * OD-40: los fixtures MRZ de evals/fixtures solo usan números de documento de la lista de sintéticos declarada. Cada
 * cadena JSON se separa por `\n` y se toman las líneas de 28 a 46 caracteres: hasta 32 se lee como TD1 (30), hasta 39
 * como TD2 (36) y desde 40 como TD3 (44), con margen para el ruido OCR. Un número debe tener al menos un dígito, así
 * la línea de nombres no cuenta. Además, el opcional de la línea 2 del TD1 (posiciones 18 a 28, el NUIP de la cédula
 * digital) y el número personal de la línea 2 del TD3 (posiciones 28 a 42) deben estar vacíos, empezar por 9999 (tras
 * quitar los ceros a la izquierda) o figurar en la lista.
 */
const LISTA_MRZ = JSON.parse(readFileSync(new URL("./privacidad/numeros-mrz-sinteticos.json", import.meta.url), "utf8"));
export const NUMEROS_MRZ_SINTETICOS = new Set(LISTA_MRZ.numeros.map((e) => (typeof e === "string" ? e : e.numero)));
const FIXTURE_JSON = /^evals\/fixtures\/.*\.json$/;
const CADENA_JSON = /"((?:[^"\\]|\\.)*)"/g;
const LINEA_MRZ = /^[A-Z0-9<]{28,46}$/;
const TD3_LINEA2 = /^([A-Z0-9<]{9})[0-9<][A-Z<]{3}[0-9<]{6}[0-9<][MFX<]/;
const TD1_LINEA1 = /^[A-Z][A-Z0-9<]{4}([A-Z0-9<]{9})[0-9<]/;

const cifras = (s) => s.replace(/[^0-9]/g, "").length;
const sinRelleno = (s) => s.replace(/<+$/, "");

/** Números de una línea MRZ que deben figurar en la lista: [valor, esOpcional]. */
function numerosMrz(linea) {
  const n = linea.length;
  if (n <= 32) {
    // TD1: línea 2 si las dos fechas son cifras (con margen para el ruido OCR), si no, línea 1.
    if (cifras(linea.slice(0, 7)) >= 4 && cifras(linea.slice(8, 15)) >= 4) return [[sinRelleno(linea.slice(18, 29)), true]];
    const m = TD1_LINEA1.exec(linea);
    return m ? [[sinRelleno(m[1]), false]] : [];
  }
  const m = TD3_LINEA2.exec(linea);
  if (!m) return [];
  const numeros = [[sinRelleno(m[1]), false]];
  if (n >= 40) numeros.push([sinRelleno(linea.slice(28, 42)), true]);
  return numeros;
}

function numeroNoDeclarado([valor, opcional]) {
  if (NUMEROS_MRZ_SINTETICOS.has(valor)) return false;
  if (!opcional) return /[0-9]/.test(valor);
  const sinCeros = valor.replace(/^0+/, "");
  return valor !== "" && !sinCeros.startsWith("9999") && !NUMEROS_MRZ_SINTETICOS.has(sinCeros);
}

function revisarNativo(r, contenido) {
  const gradle = GRADLE_NATIVO.test(r);
  return contenido.split(/\r?\n/).flatMap((texto, i) => {
    if (gradle && !/^\s*\/\//.test(texto) && GRADLE_PROHIBIDO.test(texto)) {
      const artefacto = /["']([^"']+)["']/.exec(texto)?.[1] ?? texto.trim();
      return [{ ruta: r, linea: i + 1, mensaje: `OD-40: dependencia nativa de QR, códigos de barras de terceros o NFC prohibida: ${artefacto}` }];
    }
    if (!gradle && /android\.permission\.NFC\b/.test(texto)) {
      return [{ ruta: r, linea: i + 1, mensaje: "OD-40: el manifiesto nativo no declara android.permission.NFC (no se leen chips)" }];
    }
    return [];
  });
}

function revisarDependencias(r, contenido) {
  let paquete;
  try {
    paquete = JSON.parse(contenido);
  } catch {
    return [];
  }
  const lineas = contenido.split(/\r?\n/);
  return SECCIONES_DEPENDENCIAS.flatMap((s) => Object.keys(paquete?.[s] ?? {}))
    .filter((nombre) => !DEPENDENCIA_PERMITIDA.has(nombre) && DEPENDENCIA_PROHIBIDA.some((p) => p.test(nombre)))
    .map((nombre) => ({
      ruta: r,
      linea: lineas.findIndex((l) => l.includes(`"${nombre}"`)) + 1,
      mensaje: `OD-40: dependencia de QR, códigos de barras de terceros o NFC prohibida en un paquete de producto: ${nombre}`,
    }));
}

function revisarNumerosMrz(r, contenido) {
  return contenido.split(/\r?\n/).flatMap((texto, i) =>
    [...texto.matchAll(CADENA_JSON)]
      .flatMap((m) => m[1].split(/\\r\\n|\\n|\\r/))
      .filter((linea) => LINEA_MRZ.test(linea))
      .flatMap(numerosMrz)
      .filter(numeroNoDeclarado)
      .map(([n]) => ({
        ruta: r,
        linea: i + 1,
        mensaje: `OD-40: fixture MRZ con el número ${n}, fuera de la lista de sintéticos declarada (tools/privacidad/numeros-mrz-sinteticos.json)`,
      })),
  );
}

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
  if (PAQUETE_PRODUCTO.test(r)) hallazgos.push(...revisarDependencias(r, contenido));
  if (FIXTURE_JSON.test(r)) hallazgos.push(...revisarNumerosMrz(r, contenido));
  if (GRADLE_NATIVO.test(r) || MANIFIESTO_NATIVO.test(r)) hallazgos.push(...revisarNativo(r, contenido));

  const testMarcado = ES_TEST.test(r) && contenido.includes("fixture-sintetico");
  const lineas = contenido.split(/\r?\n/);
  const off11 = OFF11_RUTAS.test(r) && !ES_TEST.test(r);
  const nativo = NATIVO_RUTAS.test(r) && !NATIVO_PRUEBA.test(r);
  const manifiesto = MANIFIESTO_LIBRERIA.test(r);
  lineas.forEach((texto, i) => {
    if (manifiesto && /android\.permission\.INTERNET\b/.test(texto)) {
      hallazgos.push({ ruta: r, linea: i + 1, mensaje: "NAT-13: el manifiesto de la librería no declara android.permission.INTERNET" });
      return;
    }
    if (nativo) {
      const regla = NATIVO_REGLAS.find(([patron]) => patron.test(texto));
      if (regla) {
        hallazgos.push({ ruta: r, linea: i + 1, mensaje: regla[1] });
        return;
      }
    }
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

function listarArchivos(staged, raiz) {
  if (raiz !== undefined) {
    // --raiz <dir>: revisa un directorio cualquiera sin git (OD-40, escenarios con directorios temporales).
    return readdirSync(raiz, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => relative(raiz, join(e.parentPath, e.name)).replace(/\\/g, "/"))
      .filter((r) => !/(^|\/)(node_modules|\.git)\//.test(r));
  }
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files", "--cached", "--others", "--exclude-standard"];
  return execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

function leer(ruta, staged, raiz) {
  if (EXT_MEDIA.test(ruta)) return null;
  try {
    const texto = staged
      ? execFileSync("git", ["show", `:${ruta}`], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 })
      : readFileSync(raiz === undefined ? ruta : join(raiz, ruta), "utf8");
    return texto.includes("\u0000") ? null : texto;
  } catch {
    return null;
  }
}

function main(argv) {
  const staged = argv.includes("--staged");
  const i = argv.indexOf("--raiz");
  const raiz = i >= 0 && argv[i + 1] !== undefined ? resolve(argv[i + 1]) : undefined;
  const hallazgos = listarArchivos(staged, raiz).flatMap((ruta) => revisarArchivo(ruta, leer(ruta, staged, raiz)));
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
