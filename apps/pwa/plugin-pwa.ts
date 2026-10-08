/**
 * Plugin de compilación de la PWA (design.md, decisión 10): emite los iconos 192 y 512 (generados aquí, sin datos ni
 * imágenes versionadas), neutraliza las URLs de CDN (OFF-04), enlaza cada core de tesseract.js con su .wasm con hash y
 * genera el manifiesto de precaché con SHA-256 y tamaño (pwa-lectura-offline, OFF-01, OFF-02; decisión 7), que se
 * emite como `assets/precache-manifest.<hash>.json` y se inyecta en `sw.js` (`__MANIFIESTO__`, `__VERSION__`).
 */
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { OutputBundle } from "rollup";
import type { Plugin } from "vite";
import { construirManifiesto } from "./src/precache/manifiesto";

function trozo(tipo: string, datos: Buffer): Buffer {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Icono RGB: fondo oscuro con un rectángulo verde de proporción ID-1 (la guía), sin texto ni datos. */
export function iconoPng(lado: number): Buffer {
  const fila = 1 + lado * 3;
  const crudo = Buffer.alloc(fila * lado);
  const anchoGuia = Math.round(lado * 0.7);
  const altoGuia = Math.round(anchoGuia / (85.6 / 53.98));
  const x0 = Math.round((lado - anchoGuia) / 2);
  const y0 = Math.round((lado - altoGuia) / 2);
  const grosor = Math.max(2, Math.round(lado / 24));
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const dentro = x >= x0 && x < x0 + anchoGuia && y >= y0 && y < y0 + altoGuia;
      const borde = dentro && (x < x0 + grosor || x >= x0 + anchoGuia - grosor || y < y0 + grosor || y >= y0 + altoGuia - grosor);
      const [r, g, b] = borde ? [74, 222, 128] : [17, 17, 17];
      crudo.writeUInt8(r, y * fila + 1 + x * 3);
      crudo.writeUInt8(g, y * fila + 2 + x * 3);
      crudo.writeUInt8(b, y * fila + 3 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.writeUInt8(8, 8); // 8 bits
  ihdr.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(crudo)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/** Prefijos de CDN de tesseract.js y zxing-wasm: se neutraliza para que ninguna ruta por defecto salga del origen (OFF-04). */
const CDN = /https:\/\/([a-z]+\.)?jsdelivr\.net\/npm\//gu;
const SIN_CDN = "/sin-cdn/";
const CORE = /^assets\/tesseract-core-(simd-lstm|lstm)-[^/]+\.js$/u;

type Archivo = OutputBundle[string];

function texto(a: Archivo): string | null {
  if (a.type === "chunk") return a.code;
  return typeof a.source === "string" ? a.source : /\.(js|json|html|css|webmanifest)$/u.test(a.fileName) ? Buffer.from(a.source).toString("utf8") : null;
}

function fijarTexto(a: Archivo, t: string): void {
  if (a.type === "chunk") a.code = t;
  else a.source = t;
}

function datos(a: Archivo): Uint8Array {
  if (a.type === "chunk") return Buffer.from(a.code, "utf8");
  return typeof a.source === "string" ? Buffer.from(a.source, "utf8") : a.source;
}

export const sha256Hex = (d: Uint8Array): string => createHash("sha256").update(d).digest("hex");

/** Nombres de los recursos de lectura (OFF-01): el worker de tesseract.js se emite como `tesseract-worker-<hash>.js`. */
export function nombreRecurso(info: { readonly names?: readonly string[] | undefined; readonly name?: string | undefined }): string {
  const nombre = info.names?.[0] ?? info.name ?? "";
  return nombre === "worker.min.js" ? "assets/tesseract-worker-[hash][extname]" : "assets/[name]-[hash][extname]";
}

/** La tabla DIVIPOL va en su propio chunk, importado solo por el Worker lector (design.md, decisión 6). */
export function chunkDivipol(id: string): string | undefined {
  return /[\\/]parsers[\\/](src|dist)[\\/]divipol[\\/]tabla\.generated\.[jt]s$/u.test(id) ? "divipol" : undefined;
}

export function pluginPwa(): Plugin {
  return {
    name: "lector-cedula-pwa",
    apply: "build",
    enforce: "post",
    generateBundle(_opciones, bundle) {
      for (const lado of [192, 512]) this.emitFile({ type: "asset", fileName: `iconos/icono-${lado}.png`, source: iconoPng(lado) });
      // Chunks .js vacíos (la tabla DIVIPOL que el Worker de calidad descarta por tree-shaking): nadie los importa.
      for (const [nombre, a] of Object.entries(bundle)) if (nombre.endsWith(".js") && (texto(a) ?? "x").trim() === "") Reflect.deleteProperty(bundle, nombre);
      // OFF-04: sin URLs de CDN en ningún archivo emitido.
      for (const a of Object.values(bundle)) {
        const t = texto(a);
        if (t !== null && CDN.test(t)) fijarTexto(a, t.replace(CDN, SIN_CDN));
        CDN.lastIndex = 0;
      }
      // Cada core de tesseract.js carga su .wasm por nombre: se reescribe al nombre con hash.
      for (const a of Object.values(bundle)) {
        const variante = CORE.exec(a.fileName)?.[1];
        if (variante === undefined) continue;
        const wasm = Object.keys(bundle).find((n) => new RegExp(`^assets/tesseract-core-${variante}-[^/]+\\.wasm$`, "u").test(n));
        if (wasm === undefined) throw new Error(`falta el wasm de tesseract-core-${variante}`);
        fijarTexto(a, (texto(a) ?? "").replaceAll(`tesseract-core-${variante}.wasm`, wasm.slice("assets/".length)));
      }
      const sw = bundle["sw.js"];
      if (sw === undefined || sw.type !== "chunk") throw new Error("sw.js no se emitió");
      const archivos = Object.values(bundle)
        .filter((a) => a.fileName !== "sw.js")
        .map((a) => ({ nombre: a.fileName, datos: datos(a) }));
      // public/ lo copia Vite tal cual fuera del bundle.
      archivos.push({ nombre: "manifest.webmanifest", datos: readFileSync(new URL("./public/manifest.webmanifest", import.meta.url)) });
      const manifiesto = construirManifiesto(archivos, sha256Hex);
      const json = JSON.stringify(manifiesto);
      this.emitFile({ type: "asset", fileName: `assets/precache-manifest.${sha256Hex(Buffer.from(json)).slice(0, 12)}.json`, source: json });
      sw.code = sw.code.replaceAll("__MANIFIESTO__", json).replaceAll("__VERSION__", JSON.stringify(manifiesto.version));
    },
  };
}
