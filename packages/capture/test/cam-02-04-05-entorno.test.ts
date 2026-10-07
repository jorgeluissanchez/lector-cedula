import { describe, expect, it } from "vitest";
import { evaluarEntorno, TEXTOS_ENTORNO } from "../src/flujo/entorno.js";
import { avisoResolucion, clasificarResolucion } from "../src/flujo/resolucion.js";
import { clasificarErrorCamara } from "../src/flujo/errores-camara.js";

describe("CAM-02 Contexto seguro y soporte de cámara", () => {
  it("CAM-02 Evaluación del entorno", () => {
    const casos: [boolean, boolean][] = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ];
    expect(casos.map(([seguro, gum]) => evaluarEntorno({ contextoSeguro: seguro, tieneGetUserMedia: gum }))).toStrictEqual([
      "apto",
      "sin-soporte",
      "contexto-inseguro",
      "contexto-inseguro",
    ]);
  });

  it("CAM-02 Textos de los errores de entorno", () => {
    expect(TEXTOS_ENTORNO).toStrictEqual({
      "contexto-inseguro": "La cámara solo funciona en una conexión segura (HTTPS).",
      "sin-soporte": "Este navegador no permite usar la cámara.",
    });
  });
});

describe("CAM-04 Resolución mínima", () => {
  it("CAM-04 Clasificación de resoluciones", () => {
    const casos: [number, number][] = [
      [1920, 1080],
      [1080, 1920],
      [3840, 2160],
      [1280, 720],
      [1440, 1080],
    ];
    expect(casos.map(([w, h]) => clasificarResolucion(w, h))).toStrictEqual(["suficiente", "suficiente", "suficiente", "baja", "baja"]);
  });

  it("CAM-04 Texto del aviso de cámara de 1280x720 y sin aviso en 1920x1080", () => {
    expect(avisoResolucion(1280, 720)).toBe("Tu cámara entrega 1280x720; se necesitan 1920x1080 para leer el código.");
    expect(avisoResolucion(1440, 1080)).toBe("Tu cámara entrega 1440x1080; se necesitan 1920x1080 para leer el código.");
    expect(avisoResolucion(1920, 1080)).toBeNull();
    expect(avisoResolucion(1080, 1920)).toBeNull();
  });

  it("CAM-04 Límites exactos de cada lado", () => {
    expect(clasificarResolucion(1919, 1080)).toBe("baja");
    expect(clasificarResolucion(1920, 1079)).toBe("baja");
    expect(clasificarResolucion(1079, 1920)).toBe("baja");
    expect(clasificarResolucion(1080, 1919)).toBe("baja");
  });
});

describe("CAM-05 Errores de cámara", () => {
  it("CAM-05 Clasificación de errores", () => {
    const rechazos: unknown[] = [
      new DOMException("x", "NotAllowedError"),
      new DOMException("x", "SecurityError"),
      new DOMException("x", "NotFoundError"),
      new DOMException("x", "OverconstrainedError"),
      new DOMException("x", "NotReadableError"),
      new DOMException("x", "AbortError"),
      new TypeError("x"),
      "x",
    ];
    const permiso = { codigo: "permiso-denegado", texto: "Permite el acceso a la cámara para continuar." };
    const sinCamara = { codigo: "sin-camara", texto: "No encontramos una cámara disponible." };
    const ocupada = { codigo: "camara-ocupada", texto: "La cámara está en uso por otra aplicación." };
    const desconocido = { codigo: "desconocido", texto: "No pudimos iniciar la cámara." };
    expect(rechazos.map(clasificarErrorCamara)).toStrictEqual([permiso, permiso, sinCamara, sinCamara, ocupada, ocupada, desconocido, desconocido]);
  });

  it("CAM-05 Objetos que no son errores con name conocido", () => {
    expect(clasificarErrorCamara(null).codigo).toBe("desconocido");
    expect(clasificarErrorCamara({ name: "NotAllowedError" }).codigo).toBe("permiso-denegado");
    expect(clasificarErrorCamara({ name: 3 }).codigo).toBe("desconocido");
    // Una función con ese nombre no es un rechazo de getUserMedia.
    expect(clasificarErrorCamara(function NotAllowedError() {}).codigo).toBe("desconocido");
  });
});
