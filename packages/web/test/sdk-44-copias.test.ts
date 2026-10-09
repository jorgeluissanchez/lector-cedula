// SDK-44 "Copias a cero": la copia de la imagen del envío y los frames quedan a cero al liberar (idempotente) y ante
// una excepción durante la captura.
import { describe, expect, it } from "vitest";
import { copiaEnvio, conCeroAnteError } from "../src/copias.js";

const lleno = (n: number): Uint8ClampedArray => new Uint8ClampedArray(n).fill(200);
const ceros = (a: Uint8ClampedArray): boolean => a.every((v) => v === 0);

describe("SDK-44 Copias a cero", () => {
  it("SDK-44 liberar pone a cero la copia del envío y es idempotente", () => {
    const original = lleno(16);
    const c = copiaEnvio({ ancho: 2, alto: 2, pixeles: original });
    expect(c.pixeles).not.toBe(original);
    expect(ceros(c.pixeles)).toBe(false);
    c.liberar();
    expect(ceros(c.pixeles)).toBe(true);
    expect(() => c.liberar()).not.toThrow();
    expect(ceros(original)).toBe(false);
  });

  it("SDK-44 una excepción durante la captura pone a cero todos los búferes y relanza", async () => {
    const a = lleno(8);
    const b = lleno(8);
    const vistos: Uint8ClampedArray[] = [a];
    const err = new Error("foto");
    await expect(
      conCeroAnteError(vistos, async () => {
        vistos.push(b);
        throw err;
      }),
    ).rejects.toBe(err);
    expect(ceros(a) && ceros(b)).toBe(true);
  });

  it("SDK-44 sin excepción no toca los búferes y devuelve el valor", async () => {
    const a = lleno(4);
    expect(await conCeroAnteError([a], async () => 7)).toBe(7);
    expect(ceros(a)).toBe(false);
  });
});
