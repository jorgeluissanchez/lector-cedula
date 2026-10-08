/**
 * Manifiesto de precaché (OFF-01, OFF-02; design.md, decisión 7). Puro: lo usa plugin-pwa.ts con los archivos
 * emitidos y su función SHA-256. `/` lleva los bytes de `index.html`. Versión: huella de todas las entradas.
 */
import { listaRecursos } from "../recursos";
import type { EntradaManifiesto } from "./verificar";

export interface ManifiestoPrecache {
  readonly version: string;
  readonly entradas: readonly EntradaManifiesto[];
}

export interface ArchivoEmitido {
  readonly nombre: string;
  readonly datos: Uint8Array;
}

export function construirManifiesto(archivos: readonly ArchivoEmitido[], sha256: (datos: Uint8Array) => string): ManifiestoPrecache {
  const porRuta = new Map(archivos.map((a) => [`/${a.nombre.replace(/^\//u, "")}`, a.datos]));
  for (const fijo of ["/index.html", "/manifest.webmanifest"]) if (!porRuta.has(fijo)) throw new Error(`falta ${fijo.slice(1)}`);
  porRuta.set("/", porRuta.get("/index.html") as Uint8Array);
  const nombres = archivos.map((a) => a.nombre).filter((n) => !n.endsWith(".map"));
  const entradas = listaRecursos(nombres).map((ruta) => {
    const datos = porRuta.get(ruta) as Uint8Array;
    return { ruta, bytes: datos.byteLength, sha256: sha256(datos) };
  });
  const huella = sha256(new TextEncoder().encode(entradas.map((e) => `${e.ruta} ${e.bytes} ${e.sha256}`).join("\n")));
  return { version: huella.slice(0, 12), entradas };
}
