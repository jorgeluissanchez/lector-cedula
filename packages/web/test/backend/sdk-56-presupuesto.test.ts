// SDK-56 Presupuesto con fixture que falla (`TB`): el grafo real del modo back pasa y un fixture de
// PRESUPUESTO_BACK + 1 bytes sale con código 1. Lanza procesos de Node: timeout de 60 s (CLAUDE.md, errores pasados).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error script .mjs sin tipos
import { PRESUPUESTO_BACK } from "../../scripts/tamano-back.mjs";

const script = fileURLToPath(new URL("../../scripts/tamano-back.mjs", import.meta.url));
const correr = (...a: string[]) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });

describe("SDK-56 Presupuesto con fixture que falla", { timeout: 60_000 }, () => {
  it("el árbol real del modo back pasa", () => {
    const r = correr();
    expect(r.stdout).toMatch(/modo back: \d+ B gzip/u);
    expect(r.status).toBe(0);
  });

  it("un fixture de PRESUPUESTO_BACK + 1 bytes sale con 1 y uno de PRESUPUESTO_BACK con 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "tamano-back-"));
    try {
      const grande = join(dir, "grande.bin");
      const justo = join(dir, "justo.bin");
      writeFileSync(grande, new Uint8Array((PRESUPUESTO_BACK as number) + 1));
      writeFileSync(justo, new Uint8Array(PRESUPUESTO_BACK as number));
      expect(correr("--fixture", grande).status).toBe(1);
      expect(correr("--fixture", justo).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("PRESUPUESTO_BACK no supera el tope de 300 KiB", () => {
    expect(PRESUPUESTO_BACK).toBeLessThanOrEqual(300 * 1024);
  });
});
