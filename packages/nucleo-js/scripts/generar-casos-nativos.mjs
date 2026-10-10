// Casos de igualdad entre motores para las pruebas nativas (sdk-nativo, NAT-07; tarea 1.1). Evalúa el bundle real en
// Node (contexto `node:vm` sin globals de navegador) sobre los mismos fixtures que nat-07-quickjs.test.ts y escribe
// entradas y salidas JSON. Kotlin (QuickJS) y Swift (JavaScriptCore) comparan byte a byte. Una prueba de Vitest falla
// si el archivo versionado se desfasa del bundle o de los fixtures.
// fixture-sintetico: solo el catálogo del generador (PERSONA_BASE, NUIP 9999123456), nunca datos reales.
// Uso: node packages/nucleo-js/scripts/generar-casos-nativos.mjs [--salida <ruta>]
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { construirNucleo } from "./construir.mjs";

const dirPaquete = fileURLToPath(new URL("..", import.meta.url));
const raiz = resolve(dirPaquete, "..", "..");

export const RUTA_CASOS = resolve(raiz, "native", "android", "nucleo", "src", "test", "resources", "lectorcedula", "casos-motor.json");

const FECHA = "2026-10-09";

async function catalogo() {
  const { build } = await import("esbuild");
  const r = await build({
    entryPoints: [resolve(raiz, "packages", "fixtures", "src", "index.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString("base64")}`);
}

async function codigoBundle() {
  const dir = mkdtempSync(join(tmpdir(), "nucleo-casos-"));
  try {
    const salida = join(dir, "nucleo.js");
    await construirNucleo({ salida });
    return readFileSync(salida, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Texto JSON de los casos `{ fn, args, salida }` (salida = JSON.stringify en Node). */
export async function textoCasos() {
  const { casosPdf417, casosMrz } = await catalogo();
  const contexto = {};
  createContext(contexto);
  runInContext(await codigoBundle(), contexto, { filename: "nucleo.js" });
  const api = contexto.LectorCedulaNucleo;
  const b64 = (bytes) => Buffer.from(bytes).toString("base64");
  const llamadas = [];
  for (const { id, fixture } of casosPdf417()) {
    for (const opciones of [{ fechaReferencia: FECHA }, { fechaReferencia: FECHA, enmascarar: true }, { fechaReferencia: "2000-01-01", admitirTi: true }]) {
      llamadas.push({ id, fn: "procesarPdf417", args: [b64(fixture.bytes), opciones] });
    }
  }
  for (const { id, fixture } of casosMrz()) llamadas.push({ id, fn: "procesarMrz", args: [[...fixture.lineas], { fechaReferencia: FECHA }] });
  const estado = JSON.parse(JSON.stringify(api.crearEstado()));
  const invalidas = [
    ["procesarPdf417", ["no-es-base64!", { fechaReferencia: FECHA }]],
    ["procesarPdf417", ["", { fechaReferencia: FECHA }]],
    ["procesarPdf417", [b64(new Uint8Array([1, 2, 3])), { fechaReferencia: "2026-02-30" }]],
    ["procesarMrz", [["a", "b"], { fechaReferencia: FECHA }]],
    ["procesarMrz", [null, null]],
    ["validarOpciones", [{ sesion: "abc" }]],
    ["crearEstado", [{ sesion: "abc" }]],
    ["crearEstado", [{ servidor: "ftp://x", idioma: "en" }]],
    ["transicion", [estado, { tipo: "iniciar" }]],
    ["transicion", [{ fase: "nada" }, { tipo: "iniciar" }]],
    ["validarUrlSubida", ["https://otro.example/subir", "https://api.lector-cedula.example"]],
  ];
  invalidas.forEach(([fn, args], i) => llamadas.push({ id: `entrada-${i}`, fn, args }));
  const casos = llamadas.map((c) => ({ ...c, salida: JSON.stringify(api[c.fn](...c.args)) }));
  const version = JSON.parse(readFileSync(resolve(dirPaquete, "package.json"), "utf8")).version;
  return `${JSON.stringify({ origen: "packages/nucleo-js/scripts/generar-casos-nativos.mjs (generado; no editar)", version, casos }, null, 1)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const i = process.argv.indexOf("--salida");
  const salida = i >= 0 ? resolve(process.argv[i + 1]) : RUTA_CASOS;
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, await textoCasos());
  process.stdout.write(`casos: ${salida}\n`);
}
