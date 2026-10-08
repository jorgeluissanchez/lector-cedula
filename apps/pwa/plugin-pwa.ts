/**
 * Plugin de compilación de la PWA (design.md, decisión 10): emite los iconos 192 y 512 (generados aquí, sin datos ni
 * imágenes versionadas) y sustituye en `sw.js` los marcadores `__RECURSOS__` y `__VERSION__` por la lista de recursos
 * estáticos emitidos y su huella.
 */
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import type { Plugin } from "vite";
import { listaRecursos } from "./src/recursos";

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

export function pluginPwa(): Plugin {
  return {
    name: "lector-cedula-pwa",
    apply: "build",
    generateBundle(_opciones, bundle) {
      for (const lado of [192, 512]) this.emitFile({ type: "asset", fileName: `iconos/icono-${lado}.png`, source: iconoPng(lado) });
      const emitidos = [...Object.keys(bundle), "iconos/icono-192.png", "iconos/icono-512.png", "manifest.webmanifest"];
      const recursos = listaRecursos(emitidos);
      const sw = bundle["sw.js"];
      if (sw === undefined || sw.type !== "chunk") throw new Error("sw.js no se emitió");
      const version = createHash("sha256").update(recursos.join("\n")).update(Object.keys(bundle).sort().join("\n")).digest("hex").slice(0, 12);
      sw.code = sw.code.replaceAll("__RECURSOS__", JSON.stringify(recursos)).replaceAll("__VERSION__", JSON.stringify(version));
    },
  };
}
