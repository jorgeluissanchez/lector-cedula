import { describe, expect, it } from "vitest";

describe("Infraestructura de Vitest browser (tarea 1.2)", { timeout: 60_000 }, () => {
  it("humo: un Worker de módulo responde en Chromium real y el buffer se transfiere", async () => {
    expect(navigator.userAgent).toContain("Chrome");
    const worker = new Worker(new URL("./workers/eco.worker.ts", import.meta.url), { type: "module" });
    const buffer = new ArrayBuffer(16);
    const respuesta = new Promise<unknown>((resolve) => {
      worker.onmessage = (e: MessageEvent<unknown>) => resolve(e.data);
    });
    worker.postMessage({ valor: 41, buffer }, [buffer]);
    expect(buffer.byteLength).toBe(0);
    expect(await respuesta).toStrictEqual({ valor: 42, bytes: 16 });
    worker.terminate();
  });
});
