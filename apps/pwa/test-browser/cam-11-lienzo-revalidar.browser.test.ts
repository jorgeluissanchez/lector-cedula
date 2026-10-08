// Hallazgo del revisor de privacidad (CAM-11, OFF-11): el OffscreenCanvas de la revalidación no conserva el frame
// completo tras el análisis, en ninguna rama (éxito, error o excepción). Frames sintéticos en memoria.
import { describe, expect, it } from "vitest";
import { conLienzoTemporal } from "../src/lienzo";

const frame = () => ({ ancho: 4, alto: 2, pixeles: new Uint8ClampedArray(4 * 2 * 4).fill(200) });

function vacio(l: OffscreenCanvas): boolean {
  const ctx = l.getContext("2d") as OffscreenCanvasRenderingContext2D;
  return ctx.getImageData(0, 0, l.width, l.height).data.every((b) => b === 0);
}

describe("CAM-11 lienzo de revalidación", () => {
  it("dibuja el frame para el análisis y lo vacía al terminar", async () => {
    let visto: OffscreenCanvas | null = null;
    let pixelDurante = -1;
    const r = await conLienzoTemporal(frame(), async (l) => {
      visto = l;
      pixelDurante = (l.getContext("2d") as OffscreenCanvasRenderingContext2D).getImageData(0, 0, 1, 1).data[0] ?? -1;
      return "ok";
    });
    expect(r).toBe("ok");
    expect(pixelDurante).toBe(200);
    expect(visto).not.toBeNull();
    const l = visto as unknown as OffscreenCanvas;
    expect([l.width, l.height]).toStrictEqual([1, 1]);
    expect(vacio(l)).toBe(true);
  });

  it("también lo vacía si el análisis lanza", async () => {
    let visto: OffscreenCanvas | null = null;
    await expect(
      conLienzoTemporal(frame(), async (l) => {
        visto = l;
        throw new Error("worker");
      }),
    ).rejects.toThrow("worker");
    const l = visto as unknown as OffscreenCanvas;
    expect([l.width, l.height]).toStrictEqual([1, 1]);
    expect(vacio(l)).toBe(true);
  });
});
