// OFF-02 Integridad SHA-256 de la precaché (pwa-lectura-offline, tarea 4.1): `verificarEntrada` con crypto.subtle.
import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { verificarEntrada } from "../src/precache/verificar";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const texto = (s: string) => new TextEncoder().encode(s);

describe("OFF-02 Integridad SHA-256 de la precaché", { timeout: 60_000 }, () => {
  it("OFF-02 Función de verificación", async () => {
    const entrada = { ruta: "/assets/a.bin", bytes: 3, sha256: ABC };
    expect(await verificarEntrada(entrada, texto("abc"))).toStrictEqual({ ok: true });
    expect(await verificarEntrada(entrada, texto("abd"))).toStrictEqual({ ok: false, motivo: "integridad-fallida", ruta: "/assets/a.bin" });
  });

  it("OFF-02 acepta ArrayBuffer y rechaza tamaño distinto aunque el digest sea de otro contenido", async () => {
    expect(await verificarEntrada({ ruta: "/a", bytes: 3, sha256: ABC }, texto("abc").buffer)).toStrictEqual({ ok: true });
    expect(await verificarEntrada({ ruta: "/a", bytes: 4, sha256: ABC }, texto("abc"))).toStrictEqual({ ok: false, motivo: "integridad-fallida", ruta: "/a" });
  });

  it("OFF-02 rechaza un digest en mayúsculas o mal formado", async () => {
    for (const sha256 of [ABC.toUpperCase(), ABC.slice(1), `${ABC}0`, "", "z".repeat(64)]) {
      expect(await verificarEntrada({ ruta: "/a", bytes: 3, sha256 }, texto("abc"))).toStrictEqual({ ok: false, motivo: "integridad-fallida", ruta: "/a" });
    }
  });

  it("OFF-02 propiedad: el digest correcto acepta y cualquier byte cambiado rechaza", async () => {
    let utiles = 0;
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 256 }), fc.nat(), fc.integer({ min: 1, max: 255 }), async (datos, pos, delta) => {
        const entrada = { ruta: "/assets/x.bin", bytes: datos.length, sha256: createHash("sha256").update(datos).digest("hex") };
        expect(await verificarEntrada(entrada, datos)).toStrictEqual({ ok: true });
        const alterado = new Uint8Array(datos);
        const i = pos % datos.length;
        alterado[i] = ((alterado[i] ?? 0) + delta) % 256;
        expect(await verificarEntrada(entrada, alterado)).toStrictEqual({ ok: false, motivo: "integridad-fallida", ruta: "/assets/x.bin" });
        utiles++;
      }),
      { numRuns: 1000 },
    );
    expect(utiles).toBe(1000);
  });
});
