// Presupuesto de tamaño del SDK nativo (sdk-nativo, NAT-18; design.md, decisión 5 del orquestador). Mide el bundle
// `@lector-cedula/nucleo-js` (gzip nivel 9 del IIFE minificado, construido en un directorio temporal) contra su tope, e
// informa el AAR y el XCFramework comparándolos con el registro anterior (`native/tamanos.json`): falla si alguno
// crece más de un 10 %. Sin límite absoluto para los artefactos hasta decisión humana (design.md, "Riesgos").
// Uso: node tools/tamano-nativo.mjs                                  -> bundle real y artefactos compilados presentes
//      node tools/tamano-nativo.mjs --bundle <js>                     -> mide un archivo ya empaquetado (fixtures)
//      node tools/tamano-nativo.mjs [--registro <json>] --artefacto <nombre>=<ruta> ...
//      node tools/tamano-nativo.mjs --actualizar                      -> escribe las medidas actuales en el registro
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const raiz = fileURLToPath(new URL("..", import.meta.url));

/** Techo de la spec (NAT-18). */
export const TECHO_NUCLEO_GZIP = 409_600;
/** Tope vigente: medida de la fase 0 (28 580 B gzip, 2026-10-09) más un 10 %, redondeado hacia arriba. */
export const LIMITE_NUCLEO_GZIP = 31_439;
/** Crecimiento máximo de un artefacto nativo frente al registro anterior. */
export const CRECIMIENTO_MAXIMO = 0.1;

export const REGISTRO_POR_OMISION = join(raiz, "native", "tamanos.json");

/** Artefactos que se buscan sin `--artefacto`: nombre lógico y ruta relativa a la raíz (archivo o directorio). */
export const ARTEFACTOS_POR_OMISION = Object.freeze([
  { nombre: "lector-cedula-android.aar", ruta: "native/android/lector-cedula/build/outputs/aar/lector-cedula-release.aar" },
  { nombre: "LectorCedula.xcframework", ruta: "native/ios/build/LectorCedula.xcframework" },
]);

export const gzip9 = (datos) => gzipSync(datos, { level: 9 }).byteLength;

/** Bytes en disco de un archivo o, recursivamente, de un directorio. */
export async function tamano(ruta) {
  const s = await stat(ruta);
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const n of await readdir(ruta)) total += await tamano(join(ruta, n));
  return total;
}

/** Infracción (texto) si `actual` supera el registro anterior en más de un 10 %, o `null`. */
export function evaluarCrecimiento(nombre, anterior, actual) {
  if (typeof anterior !== "number" || anterior <= 0) return null;
  return actual > anterior * (1 + CRECIMIENTO_MAXIMO) ? `${nombre}: ${actual} B crece más de un 10 % frente a ${anterior} B` : null;
}

async function medirBundleReal() {
  const { construirNucleo } = await import("../packages/nucleo-js/scripts/construir.mjs");
  const dir = await mkdtemp(join(tmpdir(), "tamano-nativo-"));
  try {
    return gzip9(await readFile(await construirNucleo({ salida: join(dir, "nucleo.js") })));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function leerArgumentos(argv) {
  const r = { bundle: null, registro: REGISTRO_POR_OMISION, artefactos: [], actualizar: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`falta el valor de ${a}`);
      return v;
    };
    if (a === "--bundle") r.bundle = valor();
    else if (a === "--registro") r.registro = resolve(valor());
    else if (a === "--actualizar") r.actualizar = true;
    else if (a === "--artefacto") {
      const v = valor();
      const igual = v.indexOf("=");
      if (igual <= 0) throw new Error("--artefacto espera <nombre>=<ruta>");
      r.artefactos.push({ nombre: v.slice(0, igual), ruta: resolve(v.slice(igual + 1)), explicito: true });
    } else throw new Error(`opción desconocida ${a}`);
  }
  return r;
}

async function principal(argv) {
  let args;
  try {
    args = leerArgumentos(argv);
  } catch (e) {
    console.error(`tamano-nativo: ${e.message}`);
    return 64;
  }
  let codigo = 0;
  const t = args.bundle === null ? await medirBundleReal() : gzip9(await readFile(args.bundle));
  const ok = t <= LIMITE_NUCLEO_GZIP && t <= TECHO_NUCLEO_GZIP;
  if (!ok) codigo = 1;
  console.log(`@lector-cedula/nucleo-js${args.bundle === null ? "" : ` (${args.bundle})`}: ${t} B gzip (límite ${LIMITE_NUCLEO_GZIP} B) ${ok ? "OK" : "EXCEDE"}`);

  const registro = existsSync(args.registro) ? JSON.parse(await readFile(args.registro, "utf8")) : { artefactos: {} };
  const candidatos = args.artefactos.length > 0 ? args.artefactos : ARTEFACTOS_POR_OMISION.map((a) => ({ ...a, ruta: join(raiz, a.ruta), explicito: false }));
  const medidos = {};
  for (const a of candidatos) {
    if (!existsSync(a.ruta)) {
      if (a.explicito) {
        console.error(`${a.nombre}: no existe ${a.ruta}`);
        codigo = 1;
      } else console.log(`${a.nombre}: sin compilar, se omite`);
      continue;
    }
    const actual = await tamano(a.ruta);
    medidos[a.nombre] = actual;
    const anterior = registro.artefactos?.[a.nombre];
    const infraccion = evaluarCrecimiento(a.nombre, anterior, actual);
    if (infraccion !== null) {
      console.error(`${infraccion} (requiere decisión humana)`);
      codigo = 1;
    } else console.log(`${a.nombre}: ${actual} B${typeof anterior === "number" ? ` (anterior ${anterior} B) OK` : " (sin registro anterior, informativo)"}`);
  }
  if (args.actualizar) {
    await writeFile(args.registro, `${JSON.stringify({ ...registro, artefactos: { ...registro.artefactos, ...medidos } }, null, 2)}\n`);
    console.log(`registro actualizado: ${args.registro}`);
  }
  return codigo;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await principal(process.argv.slice(2));
}
