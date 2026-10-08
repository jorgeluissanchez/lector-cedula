// Tarea 5.4: lectura de la cabecera Y4M de los vídeos sintéticos de la cámara simulada (design.md, decisión 11).
import { describe, expect, it } from "vitest";
import { leerCabeceraY4m } from "../../e2e/videos/y4m.mjs";

const bytes = (s) => new TextEncoder().encode(s);

describe("cabecera Y4M", () => {
  it("lee ancho, alto, cuadros por segundo y croma de una cabecera de ffmpeg", () => {
    const cabecera = bytes("YUV4MPEG2 W1920 H1080 F10:1 Ip A1:1 C420jpeg XYSCSS=420JPEG\nFRAME\n");
    expect(leerCabeceraY4m(cabecera)).toStrictEqual({ ancho: 1920, alto: 1080, fps: 10, croma: "420jpeg", texto: "YUV4MPEG2 W1920 H1080 F10:1 Ip A1:1 C420jpeg XYSCSS=420JPEG" });
  });

  it("acepta fracciones de cuadros y croma 420 a secas", () => {
    expect(leerCabeceraY4m(bytes("YUV4MPEG2 C420 W1280 H720 F30000:1001\n"))).toMatchObject({ ancho: 1280, alto: 720, fps: 30000 / 1001, croma: "420" });
  });

  it("sin croma declarado asume 420 (valor por defecto del formato)", () => {
    expect(leerCabeceraY4m(bytes("YUV4MPEG2 W2 H2 F1:1\n")).croma).toBe("420");
  });

  it("rechaza firmas, dimensiones o cabeceras sin fin de línea inválidas", () => {
    expect(() => leerCabeceraY4m(bytes("YUV4MPEG W2 H2 F1:1\n"))).toThrow("y4m-firma");
    expect(() => leerCabeceraY4m(bytes("YUV4MPEG2 W0 H2 F1:1\n"))).toThrow("y4m-dimensiones");
    expect(() => leerCabeceraY4m(bytes("YUV4MPEG2 H2 F1:1\n"))).toThrow("y4m-dimensiones");
    expect(() => leerCabeceraY4m(bytes("YUV4MPEG2 W2 H2 F1:0\n"))).toThrow("y4m-fps");
    expect(() => leerCabeceraY4m(bytes("YUV4MPEG2 W2 H2 F1:1"))).toThrow("y4m-sin-fin");
  });
});
