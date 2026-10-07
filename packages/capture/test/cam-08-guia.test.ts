import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calcularGuia, crearDetectorGuia, guiaEnAnalisis, guiaEnPantalla, PROPORCION_ID1 } from "../src/flujo/guia.js";

describe("CAM-08 Guía de encuadre", { timeout: 60_000 }, () => {
  it("CAM-08 Guía en coordenadas del frame", () => {
    const frames: [number, number][] = [
      [1920, 1080],
      [1280, 720],
      [1080, 1920],
      [3840, 2160],
      [1440, 1080],
    ];
    expect(frames.map(([w, h]) => calcularGuia(w, h))).toStrictEqual([
      { x: 190, y: 54, ancho: 1541, alto: 972 },
      { x: 126, y: 36, ancho: 1028, alto: 648 },
      { x: 54, y: 190, ancho: 972, alto: 1541 },
      { x: 379, y: 108, ancho: 3083, alto: 1944 },
      { x: 72, y: 132, ancho: 1296, alto: 817 },
    ]);
  });

  it("CAM-08 Proporción ID-1 (hipótesis C01)", () => {
    expect(PROPORCION_ID1).toBe(85.6 / 53.98);
  });

  it("CAM-08 Guía en pantalla con object-fit: contain", () => {
    const g = calcularGuia(1920, 1080);
    const escritorio = guiaEnPantalla(g, 1920, 1080, 1280, 720);
    expect(escritorio.x).toBeCloseTo(126.67, 2);
    expect(escritorio.y).toBeCloseTo(36, 9);
    expect(escritorio.ancho).toBeCloseTo(1027.33, 2);
    expect(escritorio.alto).toBeCloseTo(648, 9);
    const pixel = guiaEnPantalla(g, 1920, 1080, 412, 839);
    expect(pixel.x).toBeCloseTo(40.77, 2);
    expect(pixel.y).toBeCloseTo(315.21, 2);
    expect(pixel.ancho).toBeCloseTo(330.67, 2);
    expect(pixel.alto).toBeCloseTo(208.57, 2);
    // Contenedor más alto que ancho relativo: bandas a los lados.
    const lateral = guiaEnPantalla({ x: 0, y: 0, ancho: 100, alto: 50 }, 100, 50, 400, 100);
    expect(lateral).toStrictEqual({ x: 100, y: 0, ancho: 200, alto: 100 });
  });

  it("CAM-08 Propiedad: guía dentro del 90 %, centrada y con proporción ID-1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 320, max: 4096 }), fc.integer({ min: 320, max: 4096 }), (W, H) => {
        const g = calcularGuia(W, H);
        expect(g.ancho).toBeLessThanOrEqual(0.9 * W + 0.5);
        expect(g.alto).toBeLessThanOrEqual(0.9 * H + 0.5);
        expect(Math.abs(g.x - (W - g.x - g.ancho))).toBeLessThanOrEqual(1);
        expect(Math.abs(g.y - (H - g.y - g.alto))).toBeLessThanOrEqual(1);
        const largo = Math.max(g.ancho, g.alto);
        const corto = Math.min(g.ancho, g.alto);
        expect(Math.abs(largo / corto - 85.6 / 53.98)).toBeLessThan(2 / corto);
        // Lado largo paralelo al lado largo del frame.
        if (W > H) expect(g.ancho).toBeGreaterThanOrEqual(g.alto);
        if (H > W) expect(g.alto).toBeGreaterThanOrEqual(g.ancho);
        // Del mayor tamaño: algún lado toca el 90 % (con medio píxel de redondeo).
        expect(g.ancho >= 0.9 * W - 1 || g.alto >= 0.9 * H - 1).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("CAL-14 Interfaz de detector de documento", () => {
  it("CAL-14 Detector por defecto", async () => {
    const detector = crearDetectorGuia();
    const frame = { ancho: 640, alto: 360, anchoOriginal: 1920, altoOriginal: 1080, pixeles: new Uint8ClampedArray(640 * 360 * 4) };
    const r = await detector.detectar(frame);
    expect(detector.id).toBe("guia");
    expect(r.confianza).toBeNull();
    expect(r.fuente).toBe("guia");
    const esperado = [
      [190 / 3, 18],
      [1731 / 3, 18],
      [1731 / 3, 342],
      [190 / 3, 342],
    ];
    expect(r.cuadrilatero).not.toBeNull();
    r.cuadrilatero?.forEach((p, i) => {
      expect(Math.abs(p[0] - (esperado[i]?.[0] ?? Number.NaN))).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(p[1] - (esperado[i]?.[1] ?? Number.NaN))).toBeLessThanOrEqual(1e-9);
    });
  });

  it("CAL-14 Guía en el frame de análisis sin reducción", () => {
    expect(guiaEnAnalisis(640, 480, 640, 480)).toStrictEqual([
      [32, 59],
      [608, 59],
      [608, 422],
      [32, 422],
    ]);
  });
});
