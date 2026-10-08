/**
 * Servidor estático de prueba sobre una COPIA de apps/pwa/dist en un temporal (pwa-lectura-offline, OFF-17): permite
 * "desplegar" una versión B reescribiendo sw.js en la copia sin tocar la compilación que usan las demás pruebas.
 * Solo localhost, solo GET, sin registro de peticiones. Código de prueba, nunca de producto.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

export interface ServidorCopia {
  readonly url: string;
  /** Reescribe un archivo de la copia (por ejemplo, sw.js de la versión B). */
  reescribir(ruta: string, transformar: (texto: string) => string): void;
  cerrar(): Promise<void>;
}

export async function servirCopia(dist = join("apps", "pwa", "dist")): Promise<ServidorCopia> {
  const dir = mkdtempSync(join(tmpdir(), "pwa-copia-"));
  cpSync(dist, dir, { recursive: true });
  const servidor: Server = createServer((pet, res) => {
    const ruta = new URL(pet.url ?? "/", "http://x").pathname;
    const relativa = normalize(ruta === "/" ? "index.html" : ruta.slice(1));
    if (pet.method !== "GET" || relativa.startsWith("..")) {
      res.writeHead(405).end();
      return;
    }
    try {
      const datos = readFileSync(join(dir, relativa));
      res.writeHead(200, { "content-type": TIPOS[extname(relativa)] ?? "application/octet-stream", "cache-control": "no-cache" }).end(datos);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    reescribir(ruta, transformar) {
      const archivo = join(dir, ruta);
      writeFileSync(archivo, transformar(readFileSync(archivo, "utf8")));
    },
    async cerrar() {
      await new Promise<void>((r) => servidor.close(() => r()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
