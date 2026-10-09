// SDK-34 Adaptadores finos sin UI: presupuesto (3 072 B gzip nivel 9, fixture de 3 073 B), manifiestos y dist sin
// marcado ni estilos, para @lector-cedula/react, /angular y /vue. Requiere la compilación (`tsc -b`, parte de check).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const ejecutar = promisify(execFile);
const raiz = fileURLToPath(new URL("../../..", import.meta.url));
const ADAPTADORES = [
  { nombre: "react", framework: "react", exporta: ["useLectorCedula"] },
  { nombre: "angular", framework: "@angular/core", exporta: ["injectLectorCedula"] },
  { nombre: "vue", framework: "vue", exporta: ["useLectorCedula"] },
] as const;

async function correr(args: string[]): Promise<{ codigo: number; salida: string }> {
  try {
    const r = await ejecutar(process.execPath, args, { cwd: raiz });
    return { codigo: 0, salida: r.stdout + r.stderr };
  } catch (e) {
    const x = e as { code?: number; stdout?: string; stderr?: string };
    return { codigo: x.code ?? 1, salida: `${x.stdout ?? ""}${x.stderr ?? ""}` };
  }
}

function fixtureGzip(objetivo: number): Buffer {
  const bytes = (n: number): Buffer => Buffer.concat(Array.from({ length: Math.ceil(n / 32) }, (_, i) => createHash("sha256").update(`a${i}`).digest())).subarray(0, n);
  for (let n = objetivo - 100; n < objetivo; n++) {
    const b = bytes(n);
    if (gzipSync(b, { level: 9 }).byteLength === objetivo) return b;
  }
  throw new Error("sin fixture");
}

describe("SDK-34 Adaptadores finos sin UI", { timeout: 60_000 }, () => {
  it("SDK-34 Presupuesto de adaptadores: informa los tres y cada uno cabe en 3 072 B", async () => {
    const r = await correr(["tools/tamano-sdk.mjs"]);
    expect(r.codigo, r.salida).toBe(0);
    for (const a of ADAPTADORES) {
      const m = new RegExp(`@lector-cedula/${a.nombre}: (\\d+) B gzip \\(límite 3072 B\\) OK`, "u").exec(r.salida);
      expect(m, r.salida).not.toBeNull();
      expect(Number(m?.[1])).toBeLessThanOrEqual(3_072);
    }
  });

  it("SDK-34 Presupuesto de adaptadores: fixture de 3 073 B falla y de 3 072 B pasa", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sdk34-"));
    try {
      await writeFile(join(dir, "malo.bin"), fixtureGzip(3_073));
      await writeFile(join(dir, "bueno.bin"), fixtureGzip(3_072));
      expect((await correr(["tools/tamano-sdk.mjs", "--entrada", join(dir, "malo.bin"), "--limite", "3072"])).codigo).toBe(1);
      expect((await correr(["tools/tamano-sdk.mjs", "--entrada", join(dir, "bueno.bin"), "--limite", "3072"])).codigo).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each(ADAPTADORES)("SDK-34 Manifiestos: $nombre sin dependencies, con peers del núcleo y su framework, y dist sin UI", async (a) => {
    const dirPaquete = join(raiz, "packages", a.nombre);
    const pkg = JSON.parse(await readFile(join(dirPaquete, "package.json"), "utf8")) as Record<string, unknown>;
    expect(pkg.name).toBe(`@lector-cedula/${a.nombre}`);
    expect(pkg.license).toBe("MIT");
    expect(pkg.dependencies === undefined || Object.keys(pkg.dependencies as object).length === 0).toBe(true);
    const peers = pkg.peerDependencies as Record<string, string>;
    expect(Object.keys(peers).sort()).toStrictEqual(["@lector-cedula/web", a.framework].sort());
    const dist = join(dirPaquete, "dist");
    for (const n of await readdir(dist)) {
      if (!n.endsWith(".js") && !n.endsWith(".d.ts")) continue;
      const t = await readFile(join(dist, n), "utf8");
      expect(t).not.toContain("<style");
      expect(t).not.toContain("adoptedStyleSheets");
      expect(t).not.toContain("customElements.define");
      expect(t).not.toContain("createElement");
      expect(t).not.toContain("@lector-cedula/capture");
    }
    const m = (await import(`@lector-cedula/${a.nombre}`)) as Record<string, unknown>;
    expect(Object.keys(m).sort()).toStrictEqual([...a.exporta]);
  });

  it("SDK-31 el adaptador React compilado conserva la directiva \"use client\" en la primera línea", async () => {
    const t = await readFile(join(raiz, "packages", "react", "dist", "index.js"), "utf8");
    expect(t.split("\n")[0]).toBe('"use client";');
  });
});
