// CAM-11 "Código fuente sin salidas de datos" (seguridad o privacidad estática, tarea 5.1).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
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
    return e.isDirectory() ? archivos(ruta) : /\.(ts|tsx|js|mjs|html)$/.test(e.name) ? [ruta] : [];
  });
}

function hallazgos(raiz = RAIZ, bases: readonly string[] = ["packages/capture/src", "apps/pwa/src"]): string[] {
  const salida: string[] = [];
  for (const base of bases) {
    for (const ruta of archivos(join(raiz, base))) {
      const rel = relative(raiz, ruta).replaceAll("\\", "/");
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

  it("CAM-11 el analizador detecta identificadores prohibidos en .ts, .tsx, .js, .mjs y .html", () => {
    // Control de no vacuidad: un árbol temporal con un prohibido distinto por extensión y la excepción fuera de su archivo.
    const dir = mkdtempSync(join(tmpdir(), "cam11-"));
    try {
      const archivosPrueba: Record<string, string> = {
        "src/a.ts": "await fetch(url);",
        "src/b.tsx": "localStorage.setItem(1, 2);",
        "src/c.js": "navigator.sendBeacon(u);",
        "src/sub/d.mjs": "new WebSocket(u);",
        "src/e.html": "<script>c.toDataURL()</script>",
        "src/f.css": "fetch(",
        "src/limpio.ts": "const x = 1;",
      };
      for (const [r, t] of Object.entries(archivosPrueba)) {
        const ruta = join(dir, r);
        mkdirSync(dirname(ruta), { recursive: true });
        writeFileSync(ruta, t);
      }
      expect(hallazgos(dir, ["src"])).toStrictEqual(["src/a.ts: fetch(", "src/b.tsx: localStorage", "src/c.js: sendBeacon", "src/e.html: toDataURL", "src/sub/d.mjs: WebSocket"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
