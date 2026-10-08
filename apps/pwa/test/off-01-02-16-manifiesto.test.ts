// OFF-01 "Lista de precarga", OFF-02 "Manifiesto coherente con la compilación", OFF-16 "Presupuesto de bytes" y
// OFF-04 (estático: sin URLs de CDN ni `tessdata` en la compilación). Pwa-lectura-offline, tarea 4.2. Compila la PWA
// en un directorio temporal fuera del repositorio (no pisa apps/pwa/dist) y escribe reports/lectura/precache.json.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PWA = join(RAIZ, "apps", "pwa");
const LIMITE = 20_971_520;

interface Entrada {
  ruta: string;
  bytes: number;
  sha256: string;
}
interface Manifiesto {
  version: string;
  entradas: Entrada[];
}

let dist: string;
let manifiesto: Manifiesto;
let rutaManifiesto: string;

const archivoDe = (ruta: string) => join(dist, ruta === "/" ? "index.html" : ruta.slice(1));

function listar(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).replaceAll("\\", "/")]));
}

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "pwa-dist-"));
  execFileSync(process.execPath, [join(RAIZ, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", dist, "--emptyOutDir"], { cwd: PWA, stdio: "pipe" });
  const candidatos = readdirSync(join(dist, "assets")).filter((n) => /^precache-manifest\.[^/]+\.json$/u.test(n));
  expect(candidatos).toHaveLength(1);
  rutaManifiesto = `/assets/${candidatos[0]}`;
  manifiesto = JSON.parse(readFileSync(archivoDe(rutaManifiesto), "utf8")) as Manifiesto;
}, 120_000);

afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("OFF-01, OFF-02, OFF-04 y OFF-16 sobre la compilación", { timeout: 60_000 }, () => {
  it("OFF-01 Lista de precarga", () => {
    const rutas = manifiesto.entradas.map((e) => e.ruta);
    for (const fija of ["/", "/index.html", "/manifest.webmanifest", "/iconos/icono-192.png", "/iconos/icono-512.png"]) expect(rutas).toContain(fija);
    const patrones = [
      /^\/assets\/calidad\.worker-[^/]+\.js$/u,
      /^\/assets\/lector\.worker-[^/]+\.js$/u,
      /^\/assets\/zxing_reader-[^/]+\.wasm$/u,
      /^\/assets\/tesseract-worker-[^/]+\.js$/u,
      /^\/assets\/tesseract-core-simd-lstm-[^/]+\.wasm$/u,
      /^\/assets\/tesseract-core-lstm-[^/]+\.wasm$/u,
      /^\/assets\/tesseract-core-simd-lstm-[^/]+\.js$/u,
      /^\/assets\/tesseract-core-lstm-[^/]+\.js$/u,
      /^\/assets\/mrz-[^/]+\.traineddata$/u,
      /^\/assets\/divipol-[^/]+\.js$/u,
    ];
    for (const p of patrones) expect(rutas.filter((r) => p.test(r)), p.source).toHaveLength(1);
    expect(new Set(rutas).size).toBe(rutas.length);
    expect(rutas).not.toContain("/sw.js");
    expect(rutas).not.toContain(rutaManifiesto);
  });

  it("OFF-02 Manifiesto coherente con la compilación", () => {
    expect(manifiesto.version).toMatch(/^[0-9a-f]{12,64}$/u);
    for (const e of manifiesto.entradas) {
      const datos = readFileSync(archivoDe(e.ruta));
      expect(e.sha256, e.ruta).toMatch(/^[0-9a-f]{64}$/u);
      expect(e.bytes, e.ruta).toBe(datos.length);
      expect(e.sha256, e.ruta).toBe(createHash("sha256").update(datos).digest("hex"));
    }
    const rutas = new Set(manifiesto.entradas.map((e) => e.ruta));
    const enAssets = readdirSync(join(dist, "assets")).map((n) => `/assets/${n}`).filter((r) => r !== rutaManifiesto && !r.endsWith(".map"));
    expect(enAssets.filter((r) => !rutas.has(r))).toStrictEqual([]);
  });

  it("OFF-02 el core de cada variante apunta a su .wasm con hash", () => {
    for (const variante of ["simd-lstm", "lstm"]) {
      const js = manifiesto.entradas.find((e) => new RegExp(`^/assets/tesseract-core-${variante}-[^/]+\\.js$`, "u").test(e.ruta));
      const wasm = manifiesto.entradas.find((e) => new RegExp(`^/assets/tesseract-core-${variante}-[^/]+\\.wasm$`, "u").test(e.ruta));
      expect(js && wasm).toBeTruthy();
      const codigo = readFileSync(archivoDe(js?.ruta ?? ""), "utf8");
      expect(codigo).toContain(wasm?.ruta.slice("/assets/".length));
      expect(codigo).not.toContain(`"tesseract-core-${variante}.wasm"`);
    }
  });

  it("OFF-20 Avisos de terceros en la compilación", () => {
    expect(manifiesto.entradas.map((e) => e.ruta)).toContain("/assets/THIRD_PARTY_LICENSES.txt");
    const texto = readFileSync(archivoDe("/assets/THIRD_PARTY_LICENSES.txt"), "utf8");
    for (const s of ["Apache License", "Version 2.0", "tesseract.js", "tesseract.js-core", "zxing-wasm", "zxing-cpp", "Preact", "Leptonica", "BSD-3-Clause", "tesseract-mrz", "MIT License"]) expect(texto, s).toContain(s);
    const modelo = (JSON.parse(readFileSync(join(RAIZ, "models", "manifest.json"), "utf8")) as { fuente: string; sha256: string }[])[0];
    expect(texto).toContain(modelo?.fuente);
    expect(texto).toContain(modelo?.sha256);
  });

  it("OFF-16 Presupuesto de bytes", () => {
    const total = manifiesto.entradas.reduce((s, e) => s + e.bytes, 0);
    mkdirSync(join(RAIZ, "reports", "lectura"), { recursive: true });
    writeFileSync(join(RAIZ, "reports", "lectura", "precache.json"), `${JSON.stringify({ total, limite: LIMITE, rutas: Object.fromEntries(manifiesto.entradas.map((e) => [e.ruta, e.bytes])) }, null, 2)}\n`);
    expect(total).toBeLessThanOrEqual(LIMITE);
  });

  it("OFF-09 la compilación de producción no expone el resultado en data-resultado (revisor de privacidad)", () => {
    const conAtributo = listar(dist).filter((r) => /.(js|html)$/u.test(r) && readFileSync(join(dist, r), "utf8").includes("data-resultado"));
    expect(conAtributo).toStrictEqual([]);
  });

  it("OFF-04 sin URLs de CDN ni tessdata en la compilación", () => {
    const prohibido = /https?:\/\/[^"'`\s]*(jsdelivr|unpkg|cdn)|tessdata/iu;
    const hallazgos = listar(dist)
      .filter((r) => /\.(js|html|json|webmanifest|css)$/u.test(r) && statSync(join(dist, r)).isFile())
      .filter((r) => prohibido.test(readFileSync(join(dist, r), "utf8")));
    expect(hallazgos).toStrictEqual([]);
  });
});
