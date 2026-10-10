import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

const ejecutar = promisify(execFile);
const raiz = fileURLToPath(new URL("../../..", import.meta.url));
const web = join(raiz, "packages", "web");
const assets = join(web, "dist", "assets");

async function correr(args: string[], cwd = raiz): Promise<{ codigo: number; salida: string }> {
  try {
    const r = await ejecutar(process.execPath, args, { cwd });
    return { codigo: 0, salida: r.stdout + r.stderr };
  } catch (e) {
    const x = e as { code?: number; stdout?: string; stderr?: string };
    return { codigo: x.code ?? 1, salida: `${x.stdout ?? ""}${x.stderr ?? ""}` };
  }
}

/** Bytes deterministas (SHA-256 encadenados, incompresibles) cuyo gzip nivel 9 mide exactamente `objetivo`. */
function fixtureGzip(objetivo: number): Buffer {
  const bytes = (n: number): Buffer => Buffer.concat(Array.from({ length: Math.ceil(n / 32) }, (_, i) => createHash("sha256").update(String(i)).digest())).subarray(0, n);
  for (let n = objetivo - 100; n < objetivo; n++) {
    const b = bytes(n);
    if (gzipSync(b, { level: 9 }).byteLength === objetivo) return b;
  }
  throw new Error("sin fixture");
}

describe("SDK-29 Núcleo sin UI y presupuesto", { timeout: 60_000 }, () => {
  it("SDK-29 Importación sin efectos: Node sin DOM no toca window, document ni navigator", async () => {
    const vigia = [
      "const accesos = [];",
      "for (const n of ['window', 'document', 'navigator']) Object.defineProperty(globalThis, n, { configurable: true, get() { accesos.push(n); return undefined; } });",
      "const m = await import('@lector-cedula/web');",
      "const c = m.crearLector({});",
      "const e = c.obtenerEstado();",
      "c.suscribir(() => {})();",
      "c.destruir();",
      "console.log(JSON.stringify({ accesos, fase: e.fase, exportes: Object.keys(m).sort() }));",
    ].join("\n");
    const r = await correr(["--input-type=module", "-e", vigia]);
    expect(r.codigo, r.salida).toBe(0);
    const datos = JSON.parse(r.salida.trim().split("\n").pop() as string) as { accesos: string[]; fase: string; exportes: string[] };
    expect(datos.accesos).toStrictEqual([]);
    expect(datos.fase).toBe("inicio");
    expect(datos.exportes).toStrictEqual(["ESTADO_INICIAL", "NOMBRE_CACHE", "TRANSICIONES", "UMBRALES_FRONT", "VERSION", "crearLector", "decidirFront", "leerDocumento", "precargarMotor"]);
  });

  it("SDK-29 Presupuesto del núcleo: la compilación real cabe en 30 720 B", async () => {
    const r = await correr(["tools/tamano-sdk.mjs"]);
    expect(r.codigo, r.salida).toBe(0);
    const m = /@lector-cedula\/web: (\d+) B gzip \(límite 30720 B\) OK/u.exec(r.salida);
    expect(m, r.salida).not.toBeNull();
    expect(Number(m?.[1])).toBeLessThanOrEqual(30_720);
    expect(r.salida).toMatch(/@lector-cedula\/web\/assets: \d+ B/u);
  });

  it("SDK-29 Presupuesto del núcleo: fixture de 30 721 B falla y de 30 720 B pasa", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdk29-"));
    try {
      const malo = join(dir, "malo.bin");
      const bueno = join(dir, "bueno.bin");
      await writeFile(malo, fixtureGzip(30_721));
      await writeFile(bueno, fixtureGzip(30_720));
      expect((await correr(["tools/tamano-sdk.mjs", "--entrada", malo, "--limite", "30720"])).codigo).toBe(1);
      expect((await correr(["tools/tamano-sdk.mjs", "--entrada", bueno, "--limite", "30720"])).codigo).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("SDK-29 el código del núcleo no crea elementos, estilos ni Custom Elements", async () => {
    const fuentes = (await readdir(join(web, "src"), { recursive: true })).filter((n) => n.endsWith(".ts"));
    expect(fuentes.length).toBeGreaterThan(10);
    for (const n of fuentes) {
      const texto = await readFile(join(web, "src", n), "utf8");
      for (const prohibido of ["document.", "createElement", "customElements", "adoptedStyleSheets", "<style", "insertRule", "innerHTML", "localStorage", "sessionStorage", "indexedDB", "console."]) {
        expect(texto.includes(prohibido), `${n}: ${prohibido}`).toBe(false);
      }
    }
  });

  it("SDK-29 package.json: MIT, 0.1.0, sideEffects false, subrutas", async () => {
    const p = JSON.parse(await readFile(join(web, "package.json"), "utf8")) as Record<string, unknown>;
    expect(p).toMatchObject({ name: "@lector-cedula/web", license: "MIT", version: "0.1.0", sideEffects: false });
    expect(Object.keys(p.exports as object).sort()).toStrictEqual([".", "./assets/*", "./sw"]);
    expect(VERSION).toBe(p.version);
  });
});

describe("SDK-39 y SDK-04 assets del paquete", { timeout: 60_000 }, () => {
  it("SDK-39 Manifiesto coherente: SHA-256 de cada archivo de dist/assets coincide y no hay archivos sin entrada", async () => {
    const m = JSON.parse(await readFile(join(assets, "manifest.json"), "utf8")) as { version: string; recursos: { archivo: string; bytes: number; sha256: string }[] };
    expect(m.version).toBe(VERSION);
    const archivos = (await readdir(assets)).filter((n) => n !== "manifest.json").sort();
    expect(m.recursos.map((r) => r.archivo).sort()).toStrictEqual(archivos);
    for (const r of m.recursos) {
      const datos = await readFile(join(assets, r.archivo));
      expect(datos.byteLength, r.archivo).toBe(r.bytes);
      expect(createHash("sha256").update(datos).digest("hex"), r.archivo).toBe(r.sha256);
    }
  });

  it("SDK-04 Assets dentro del paquete npm (npm pack --dry-run)", async () => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const r = await ejecutar(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: web, shell: process.platform === "win32" });
    const lista = (JSON.parse(r.stdout) as { files: { path: string }[] }[])[0]?.files.map((f) => f.path) ?? [];
    expect(lista).toContain("dist/assets/manifest.json");
    expect(lista.some((f) => f.endsWith(".wasm"))).toBe(true);
    expect(lista).toContain("dist/assets/mrz.traineddata");
    expect(lista).toContain("dist/sw.js");
    expect(lista.some((f) => f.startsWith("src/") || f.startsWith("test"))).toBe(false);
  });
});
