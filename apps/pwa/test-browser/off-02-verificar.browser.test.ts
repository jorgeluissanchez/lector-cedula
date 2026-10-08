// OFF-02 en Chromium real (pwa-lectura-offline, tarea 4.1): `verificarEntrada` con el `crypto.subtle` del navegador.
import { describe, expect, it } from "vitest";
import { verificarEntrada } from "../src/precache/verificar";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("OFF-02 Función de verificación en navegador", () => {
  it("OFF-02 Función de verificación", async () => {
    const entrada = { ruta: "/assets/a.bin", bytes: 3, sha256: ABC };
    expect(await verificarEntrada(entrada, new TextEncoder().encode("abc"))).toStrictEqual({ ok: true });
    expect(await verificarEntrada(entrada, new TextEncoder().encode("abd"))).toStrictEqual({ ok: false, motivo: "integridad-fallida", ruta: "/assets/a.bin" });
  });
});
