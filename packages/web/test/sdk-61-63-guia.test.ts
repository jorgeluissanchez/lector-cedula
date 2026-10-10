// sdk-integracion SDK-61 (guía vertical y zona visible), SDK-62 (guiaEnPantalla en un recuadro embebido) y SDK-63
// (captura a resolución de la pista). Núcleo con dependencias falsas; geometría pura con fast-check.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crearLector, guiaEnElemento, guiaEnVideo, regionVisible, type MedidasVideo, type Rectangulo } from "../src/index.js";
import { crearFalsos, esperar, VIDEO } from "./falsos.js";

const VERTICAL_260x400: MedidasVideo = { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 260, altoElemento: 400, ajuste: "cover" };
const HORIZONTAL_320x200: MedidasVideo = { anchoVideo: 1920, altoVideo: 1080, anchoElemento: 320, altoElemento: 200, ajuste: "cover" };

const dentro = (r: Rectangulo, ancho: number, alto: number, tol = 1e-6): boolean =>
  r.x >= -tol && r.y >= -tol && r.x + r.ancho <= ancho + tol && r.y + r.alto <= alto + tol;

describe("SDK-61 Guía vertical dentro de la zona visible", () => {
  it("SDK-61 Recuadro 260x400 con cover y guía vertical", () => {
    expect(regionVisible(VERTICAL_260x400)?.ancho).toBeCloseTo(702, 6);
    const g = guiaEnVideo(VERTICAL_260x400, { orientacion: "vertical" });
    expect(g).toStrictEqual({ x: 654, y: 54, ancho: 613, alto: 972 });
    const p = guiaEnElemento(g as Rectangulo, VERTICAL_260x400) as Rectangulo;
    expect(p.x).toBeCloseTo(16.67, 2);
    expect(p.y).toBeCloseTo(20, 6);
    expect(p.ancho).toBeCloseTo(227.04, 2);
    expect(p.alto).toBeCloseTo(360, 6);
  });

  it("SDK-61 Recuadro 320x200 con cover y guía horizontal (por omisión)", () => {
    const g = guiaEnVideo(HORIZONTAL_320x200);
    expect(g).toStrictEqual({ x: 190, y: 54, ancho: 1541, alto: 972 });
    const p = guiaEnElemento(g as Rectangulo, HORIZONTAL_320x200) as Rectangulo;
    expect(p.x).toBeCloseTo(17.41, 2);
    expect(dentro(p, 320, 200)).toBe(true);
  });

  it("SDK-61 Con cover la guía horizontal se encoge a la zona visible de un recuadro vertical", () => {
    const g = guiaEnVideo(VERTICAL_260x400, { orientacion: "horizontal" }) as Rectangulo;
    expect(g.ancho).toBeLessThanOrEqual(702);
    expect(dentro(guiaEnElemento(g, VERTICAL_260x400) as Rectangulo, 260, 400)).toBe(true);
  });

  it("SDK-61 Opción guia inválida", () => {
    for (const guia of [{ orientacion: "diagonal" }, { margen: 0.3 }, { margen: -0.1 }, { margen: Number.NaN }, null]) {
      const c = crearLector({ guia } as never, crearFalsos().deps);
      expect(c.obtenerEstado().error).toMatchObject({ codigo: "opcion-invalida", opcion: "guia" });
    }
    expect(crearLector({ guia: { orientacion: "vertical", margen: 0.1 } }, crearFalsos().deps).obtenerEstado().fase).toBe("inicio");
  });
});

describe("SDK-62 guiaEnElemento (propiedades)", () => {
  const medidas = fc.record({
    anchoVideo: fc.integer({ min: 160, max: 4096 }),
    altoVideo: fc.integer({ min: 160, max: 4096 }),
    anchoElemento: fc.integer({ min: 40, max: 2000 }),
    altoElemento: fc.integer({ min: 40, max: 2000 }),
    ajuste: fc.constantFrom("cover" as const, "contain" as const),
  });

  it("SDK-62 Propiedad: la guía visible siempre queda dentro del elemento (cover y contain)", () => {
    fc.assert(
      fc.property(medidas, fc.constantFrom("horizontal" as const, "vertical" as const), fc.double({ min: 0, max: 0.25, noNaN: true }), (m, orientacion, margen) => {
        const g = guiaEnVideo(m, { orientacion, margen }) as Rectangulo;
        expect(dentro(g, m.anchoVideo, m.altoVideo)).toBe(true);
        const p = guiaEnElemento(g, m) as Rectangulo;
        expect(dentro(p, m.anchoElemento, m.altoElemento, 1e-6 * Math.max(m.anchoElemento, m.altoElemento))).toBe(true);
      }),
    );
  });

  it("SDK-62 Propiedad: contain conserva la proporción y cabe entero; cover llena el elemento", () => {
    fc.assert(
      fc.property(medidas, (m) => {
        const todo = guiaEnElemento({ x: 0, y: 0, ancho: m.anchoVideo, alto: m.altoVideo }, m) as Rectangulo;
        if (m.ajuste === "contain") {
          expect(dentro(todo, m.anchoElemento, m.altoElemento, 1e-6 * m.anchoElemento)).toBe(true);
          expect(Math.abs(todo.ancho - m.anchoElemento) < 1e-6 || Math.abs(todo.alto - m.altoElemento) < 1e-6).toBe(true);
        } else {
          expect(todo.x).toBeLessThanOrEqual(1e-6);
          expect(todo.y).toBeLessThanOrEqual(1e-6);
          expect(todo.x + todo.ancho).toBeGreaterThanOrEqual(m.anchoElemento - 1e-6);
          expect(todo.y + todo.alto).toBeGreaterThanOrEqual(m.altoElemento - 1e-6);
        }
        expect(todo.ancho / todo.alto).toBeCloseTo(m.anchoVideo / m.altoVideo, 6);
      }),
    );
  });

  it("SDK-62 Medidas no positivas: null", () => {
    expect(guiaEnElemento({ x: 0, y: 0, ancho: 1, alto: 1 }, { ...VERTICAL_260x400, anchoElemento: 0 })).toBeNull();
    expect(regionVisible({ ...VERTICAL_260x400, anchoVideo: 0 })).toBeNull();
  });
});

describe("SDK-62 Controlador: guiaEnPantalla y redimensionado", () => {
  function conMedidas(inicial: MedidasVideo, opciones = {}) {
    const f = crearFalsos({ scores: [40], guia: { x: 654, y: 54, ancho: 613, alto: 972 } });
    let medidas = inicial;
    let aviso: (() => void) | null = null;
    let cancelado = 0;
    const deps = {
      ...f.deps,
      medirVideo: () => medidas,
      observarVideo: (_v: HTMLVideoElement, fn: () => void) => {
        aviso = fn;
        return () => void cancelado++;
      },
    };
    const c = crearLector(opciones, deps);
    return {
      f,
      c,
      redimensionar(m: MedidasVideo) {
        medidas = m;
        aviso?.();
      },
      cancelados: () => cancelado,
    };
  }

  it("SDK-62 guiaEnPantalla en un recuadro 260x400 y guía vertical", async () => {
    const { f, c } = conMedidas(VERTICAL_260x400, { guia: { orientacion: "vertical" } });
    expect(c.obtenerEstado().guiaEnPantalla).toBeNull();
    await c.iniciar(VIDEO);
    const e = await esperar(c.obtenerEstado, (x) => x.guiaEnPantalla !== null);
    expect(e.guiaEnPantalla).toStrictEqual(guiaEnElemento({ x: 654, y: 54, ancho: 613, alto: 972 }, VERTICAL_260x400));
    // La guía que se envía al análisis es la de la zona visible.
    expect(f.guiasRecibidas[0]).toStrictEqual({ x: 654, y: 54, ancho: 613, alto: 972 });
    c.destruir();
  });

  it("SDK-62 Redimensionar el recuadro recalcula la guía sin esperar un frame", async () => {
    const r = conMedidas(VERTICAL_260x400);
    await r.c.iniciar(VIDEO);
    await esperar(r.c.obtenerEstado, (x) => x.guiaEnPantalla !== null);
    const vistos: unknown[] = [];
    r.c.suscribir((e) => vistos.push(e.guiaEnPantalla));
    r.redimensionar(HORIZONTAL_320x200);
    const g = guiaEnVideo(HORIZONTAL_320x200) as Rectangulo;
    expect(r.c.obtenerEstado().guia?.video).toStrictEqual(g);
    expect(r.c.obtenerEstado().guiaEnPantalla).toStrictEqual(guiaEnElemento(g, HORIZONTAL_320x200));
    expect(vistos.length).toBeGreaterThan(0);
    // Giro de la pista (vídeo vertical): también se recalcula.
    const girado = { ...HORIZONTAL_320x200, anchoVideo: 1080, altoVideo: 1920 };
    r.redimensionar(girado);
    expect(r.c.obtenerEstado().guiaEnPantalla).toStrictEqual(guiaEnElemento(guiaEnVideo(girado) as Rectangulo, girado));
    r.c.destruir();
    expect(r.cancelados()).toBe(1);
  });

  it("SDK-62 Sin medidas (vídeo sin tamaño): guiaEnPantalla null y el análisis recibe null", async () => {
    const f = crearFalsos({ scores: [40] });
    const c = crearLector({}, f.deps);
    await c.iniciar(VIDEO);
    await esperar(c.obtenerEstado, (x) => x.guia !== null);
    expect(c.obtenerEstado().guiaEnPantalla).toBeNull();
    expect(f.guiasRecibidas[0]).toBeNull();
    c.destruir();
  });
});
