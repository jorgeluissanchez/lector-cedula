// despliegue-produccion, DP-07: sirve apps/pwa/dist con exactamente las cabeceras de vercel.json (emulador de
// tools/despliegue/vercel.mjs). Solo para pruebas locales; no es un servidor de producción.
// Uso: node tools/despliegue/servir-vercel.mjs [puerto]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { cabecerasPara, leerVercel } from "./vercel.mjs";

const RAIZ = resolve(import.meta.dirname, "..", "..");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

/** Crea el servidor (sin escuchar). `dist` y `config` son inyectables para pruebas. */
export function crearServidor({ dist = join(RAIZ, "apps", "pwa", "dist"), config = leerVercel(join(RAIZ, "vercel.json")) } = {}) {
  const base = resolve(dist);
  return createServer(async (pet, res) => {
    const camino = decodeURIComponent((pet.url ?? "/").split("?")[0]);
    const relativo = camino === "/" ? "index.html" : camino.slice(1);
    const archivo = normalize(join(base, relativo));
    const cabeceras = cabecerasPara(config, pet.url ?? "/");
    if (!archivo.startsWith(base + sep)) {
      res.writeHead(400, cabeceras).end();
      return;
    }
    try {
      const datos = await readFile(archivo);
      res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream", ...cabeceras }).end(datos);
    } catch {
      res.writeHead(404, cabeceras).end();
    }
  });
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const puerto = Number(process.argv[2] ?? 4180);
  crearServidor().listen(puerto, () => process.stdout.write(`http://localhost:${puerto}\n`));
}
