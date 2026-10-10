// fixture-sintetico: sin datos personales.
// NAT-01 "Permiso denegado" (mensaje no vacío) y "Fallo del análisis de calidad": el nativo pide al bundle el
// `ErrorLector` de un código (los textos viven en packages/web/src/mensajes.ts, no en Kotlin ni Swift).
import { beforeAll, describe, expect, it } from "vitest";
import { mensaje } from "../../web/src/mensajes.js";
import { apiFuente, codigoBundle, evaluarEnVm, type ApiNucleo } from "./ayuda.js";

describe.each(["bundle", "fuente"] as const)("%s", (modo) => {
  let api: ApiNucleo;
  beforeAll(async () => {
    api = modo === "bundle" ? evaluarEnVm(await codigoBundle()).api : await apiFuente();
  }, 60_000);

  describe("NAT-01 mensajeError", { timeout: 60_000 }, () => {
    it("NAT-01 mensajeError: código conocido con el mensaje de la web en es y en", () => {
      expect(api.mensajeError("camara-denegada")).toStrictEqual({ codigo: "camara-denegada", mensaje: mensaje("camara-denegada", "es") });
      expect(api.mensajeError("calidad-error", "en")).toStrictEqual({ codigo: "calidad-error", mensaje: mensaje("calidad-error", "en") });
      expect((api.mensajeError("camara-denegada", "fr") as { mensaje: string }).mensaje).toBe(mensaje("camara-denegada", "es"));
      expect((api.mensajeError("camara-denegada") as { mensaje: string }).mensaje.length).toBeGreaterThan(0);
    });

    it("NAT-01 mensajeError: código desconocido o no texto da null y nunca lanza", () => {
      expect(api.mensajeError("no-existe")).toBeNull();
      expect(api.mensajeError(42)).toBeNull();
      expect(api.mensajeError(undefined)).toBeNull();
      expect(api.mensajeError("toString")).toBeNull();
    });
  });
});
