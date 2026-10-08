// CAM-11 "Código fuente sin salidas de datos" (seguridad o privacidad estática, tarea 5.1).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const PROHIBIDOS = [
  "fetch(",
  "XMLHttpRequest",
  "sendBeacon",
  "WebSocket",
  "EventSource",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "getDirectory",
  "createObjectURL",
  "toBlob",
  "toDataURL",
  "convertToBlob",
];
// Excepciones literales de la spec (CAM-11): `fetch(` y `caches` en el service worker, y `convertToBlob` en el
// entorno del lector MRZ (PNG en memoria para Tesseract.js, sin guardar ni enviar).
const EXCEPCIONES: Readonly<Record<string, ReadonlySet<string>>> = {
  "apps/pwa/src/sw.ts": new Set(["fetch(", "caches"]),
  "packages/capture/src/mrz/entorno.ts": new Set(["convertToBlob"]),
};

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    return e.isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

function hallazgos(): string[] {
  const salida: string[] = [];
  for (const base of ["packages/capture/src", "apps/pwa/src"]) {
    for (const ruta of archivos(join(RAIZ, base))) {
      const rel = relative(RAIZ, ruta).replaceAll("\\", "/");
      const texto = readFileSync(ruta, "utf8");
      for (const p of PROHIBIDOS) {
        if (EXCEPCIONES[rel]?.has(p)) continue;
        if (texto.includes(p)) salida.push(`${rel}: ${p}`);
      }
    }
  }
  return salida.sort();
}

describe("CAM-11 análisis estático", () => {
  it("CAM-11 Código fuente sin salidas de datos", () => {
    expect(hallazgos()).toStrictEqual([]);
  });

  it("CAM-11 el analizador detecta un identificador prohibido", () => {
    // Control de que la búsqueda no es vacía: el propio archivo de la prueba contiene los literales.
    const propio = readFileSync(fileURLToPath(import.meta.url), "utf8");
    expect(PROHIBIDOS.every((p) => propio.includes(p))).toBe(true);
  });
});
