// MOT-15 "Sin enviarA en los tipos": compila packages/web/test/tipos (la directiva @ts-expect-error se consume porque
// `enviarA` no existe en OpcionesLector). Proceso hijo de tsc.
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const TSC = join(RAIZ, "node_modules", "typescript", "bin", "tsc");

describe("MOT-15 tipos del front", { timeout: 60_000 }, () => {
  it("MOT-15 Sin enviarA en los tipos", () => {
    const r = spawnSync(process.execPath, [TSC, "-p", "packages/web/test/tipos", "--noEmit"], { cwd: RAIZ, encoding: "utf8", timeout: 55_000 });
    expect(r.stdout + r.stderr).toBe("");
    expect(r.status).toBe(0);
  });
});
