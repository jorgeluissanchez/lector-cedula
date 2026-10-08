// despliegue-produccion (DP-01 a DP-06; design.md, decisión 3): validador de vercel.json y emulador de sus cabeceras.
// Subconjunto de `source` admitido: rutas literales y grupos `(.*)`. Si varias reglas fijan la misma cabecera, gana la
// última (comportamiento de Vercel).
import { readFileSync } from "node:fs";

export const CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

export const SEGURIDAD = {
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

export const BUILD = "npm run modelos:mrz && npx tsc -b packages/parsers && npm run build -w @lector-cedula/pwa";
const SIN_CACHE = ["/", "/index.html", "/sw.js", "/manifest.webmanifest"];
const INMUTABLE = "public, max-age=31536000, immutable";
const SOURCE_VALIDO = /^\/[A-Za-z0-9._\-/]*(\(\.\*\)[A-Za-z0-9._\-/]*)*$/u;

export const leerVercel = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Expresión regular equivalente a un `source` del subconjunto admitido. */
export function regexSource(source) {
  return new RegExp(`^${source.split("(.*)").map(escapar).join("(.*)")}$`, "u");
}

/** Cabeceras que Vercel enviaría para `ruta` (la consulta no participa en la coincidencia). */
export function cabecerasPara(config, ruta) {
  const camino = ruta.split("?")[0];
  const salida = new Map();
  for (const regla of config.headers ?? []) {
    if (!regexSource(regla.source).test(camino)) continue;
    for (const { key, value } of regla.headers) salida.set(key.toLowerCase(), [key, value]);
  }
  return Object.fromEntries(salida.values());
}

function erroresCsp(csp) {
  if (csp !== CSP) {
    const prohibidos = ["'unsafe-inline'", "blob:", "data:", "http:", "https:", "*"];
    const fichas = (csp ?? "").split(/[\s;]+/u);
    const malos = fichas.filter((f) => prohibidos.some((p) => f.includes(p)) || f === "'unsafe-eval'");
    return [`DP-02: la CSP no es la de la spec${malos.length ? ` (prohibido: ${malos.join(", ")})` : ""}`];
  }
  return [];
}

/** Lista de errores de `config` frente a la spec despliegue-produccion; vacía si cumple. */
export function validarVercel(config) {
  const errores = [];
  if (config.framework !== null) errores.push("DP-01: framework debe ser null");
  if (config.installCommand !== "npm ci") errores.push("DP-01: installCommand debe ser npm ci");
  if (config.buildCommand !== BUILD) errores.push(`DP-01: buildCommand debe ser "${BUILD}" (descarga verificada de npm run modelos:mrz)`);
  if (config.outputDirectory !== "apps/pwa/dist") errores.push("DP-01: outputDirectory debe ser apps/pwa/dist");
  for (const regla of config.headers ?? []) {
    if (!SOURCE_VALIDO.test(regla.source)) errores.push(`source fuera del subconjunto admitido: ${regla.source}`);
  }
  if (errores.some((e) => e.startsWith("source"))) return errores;
  for (const ruta of ["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/assets/a-1.js", "/assets/a-1.wasm", "/assets/a-1.traineddata", "/iconos/icono-192.png"]) {
    const h = cabecerasPara(config, ruta);
    errores.push(...erroresCsp(h["Content-Security-Policy"]).map((e) => `${e} en ${ruta}`));
    for (const [k, v] of Object.entries(SEGURIDAD)) if (h[k] !== v) errores.push(`DP-03: ${k} en ${ruta} debe ser "${v}"`);
    if (Object.keys(h).some((k) => k.toLowerCase() === "service-worker-allowed")) errores.push(`DP-03: Service-Worker-Allowed no debe declararse (${ruta})`);
    const cache = h["Cache-Control"];
    if (SIN_CACHE.includes(ruta) && cache !== "no-cache") errores.push(`DP-04: ${ruta} debe tener Cache-Control no-cache`);
    if (ruta.startsWith("/assets/") && cache !== INMUTABLE) errores.push(`DP-04: ${ruta} debe ser inmutable`);
    if (ruta.endsWith(".wasm") && h["Content-Type"] !== "application/wasm") errores.push("DP-05: .wasm debe ser application/wasm");
    if (ruta.endsWith(".traineddata") && h["Content-Type"] !== "application/octet-stream") errores.push("DP-05: .traineddata debe ser application/octet-stream");
  }
  for (const clave of ["analytics", "speedInsights"]) if (clave in config) errores.push(`DP-06: ${clave} no debe declararse`);
  return [...new Set(errores)];
}

if (process.argv[1] !== undefined && import.meta.filename === (await import("node:path")).resolve(process.argv[1])) {
  const errores = validarVercel(leerVercel(process.argv[2] ?? "vercel.json"));
  for (const e of errores) process.stderr.write(`${e}\n`);
  process.stdout.write(errores.length ? "" : "vercel.json: OK\n");
  process.exit(errores.length ? 1 : 0);
}
