// FRA-12 "Presupuesto de bundle" y FRA-02 (precaché) del cambio deteccion-fraude, tarea 4.5. Compila la PWA en un
// directorio temporal fuera del repositorio (no pisa apps/pwa/dist). Mide el gzip de lo que solo carga el Worker de
// fraude (su entrada y los chunks que no comparte con el Worker lector) y comprueba que el generador sintético no entra.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const PWA = join(RAIZ, "apps", "pwa");
const PRESUPUESTO_GZIP = 153_600;

let dist: string;
let assets: string[];

const importados = (archivo: string): string[] =>
  [...readFileSync(join(dist, "assets", archivo), "utf8").matchAll(/(?:from|import)\s*\(?\s*"\.\/([^"]+\.js)"/gu)].map((m) => m[1] as string);

function cierre(entrada: string): Set<string> {
  const vistos = new Set<string>();
  const pila = [entrada];
  while (pila.length > 0) {
    const a = pila.pop() as string;
    if (vistos.has(a)) continue;
    vistos.add(a);
    pila.push(...importados(a));
  }
  return vistos;
}

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "pwa-dist-fraude-"));
  execFileSync(process.execPath, [join(RAIZ, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", dist, "--emptyOutDir"], { cwd: PWA, stdio: "pipe" });
  assets = readdirSync(join(dist, "assets"));
}, 180_000);

afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("FRA-12 y FRA-02 sobre la compilación", { timeout: 60_000 }, () => {
  it("FRA-12 presupuesto de bundle: lo exclusivo del Worker de fraude pesa <= 153600 bytes gzip", () => {
    const fraude = assets.find((n) => /^fraude\.worker-[^/]+\.js$/u.test(n));
    const lector = assets.find((n) => /^lector\.worker-[^/]+\.js$/u.test(n));
    expect(fraude).toBeDefined();
    expect(lector).toBeDefined();
    const compartidos = cierre(lector as string);
    const propios = [...cierre(fraude as string)].filter((a) => !compartidos.has(a));
    const bytes = propios.reduce((s, a) => s + gzipSync(readFileSync(join(dist, "assets", a))).length, 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(PRESUPUESTO_GZIP);
  });

  it("FRA-12 el generador sintético no entra en el bundle", () => {
    for (const a of assets.filter((n) => n.endsWith(".js"))) expect(readFileSync(join(dist, "assets", a), "utf8")).not.toContain("escena-desconocida");
  });

  it("FRA-02 el Worker de fraude está en la lista de precarga", () => {
    const m = assets.find((n) => /^precache-manifest\.[^/]+\.json$/u.test(n)) as string;
    const rutas = (JSON.parse(readFileSync(join(dist, "assets", m), "utf8")) as { entradas: { ruta: string }[] }).entradas.map((e) => e.ruta);
    expect(rutas.some((r) => /^\/assets\/fraude\.worker-[^/]+\.js$/u.test(r))).toBe(true);
  });
});
