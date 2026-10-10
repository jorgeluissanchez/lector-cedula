// MOT-07: la copia del modelo leída para el SHA-256 queda a cero (se espía readFileSync de node:fs).
import { describe, expect, it, vi } from "vitest";

const leidos: Buffer[] = [];
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
      const r = fs.readFileSync(...args);
      if (Buffer.isBuffer(r)) leidos.push(r);
      return r;
    },
  };
});

describe("recursos: búfer del modelo a cero", { timeout: 60_000 }, () => {
  it("MOT-07 verificarModelo pone a cero la copia del modelo tras calcular el hash", async () => {
    const { rutaModeloPorDefecto, verificarModelo } = await import("../src/recursos.js");
    verificarModelo(rutaModeloPorDefecto());
    expect(leidos.length).toBe(1);
    expect(leidos[0]?.length).toBeGreaterThan(1000);
    expect(leidos[0]?.every((b) => b === 0)).toBe(true);
  });
});
