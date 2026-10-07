// LMI-01 y LMI-01b (spec lectura-mrz-imagen): localización de la franja MRZ. Imágenes SINTÉTICAS: R se renderiza en
// el Chromium de Playwright con datos de @lector-cedula/fixtures; los lienzos de rectángulos son literales.
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { bandasRegulares, esPixelesRgba, localizarFranjaMrz, luminancias, umbralOtsu } from "../../src/mrz/localizar.js";

const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
type Renderizador = Awaited<ReturnType<typeof crearRenderizador>>;
let render: Renderizador;

function pixelesPng(bytes: Uint8Array) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

/** Lienzo blanco con rectángulos negros `[x, y, ancho, alto]`. */
function lienzo(w: number, h: number, rects: readonly (readonly [number, number, number, number])[] = []) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [rx, ry, rw, rh] of rects) {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
    }
  }
  return { width: w, height: h, data };
}

beforeAll(async () => {
  render = await crearRenderizador();
}, 60_000);
afterAll(async () => {
  await render.cerrar();
}, 60_000);

describe("LMI-01 Localización de la franja MRZ", { timeout: 60_000 }, () => {
  it("LMI-01 Franja por proyección en el reverso sintético", async () => {
    const r = await render.render(P.lineas);
    const c = localizarFranjaMrz(pixelesPng(r.bytes));
    const m = r.cajaMrz;
    expect(c[0]?.metodo).toBe("proyeccion");
    const caja = c[0]?.caja ?? { x: 0, y: 0, ancho: 0, alto: 0 };
    expect(caja.x).toBeLessThanOrEqual(m.x);
    expect(caja.y).toBeLessThanOrEqual(m.y);
    expect(caja.x + caja.ancho).toBeGreaterThanOrEqual(m.x + m.ancho);
    expect(caja.y + caja.alto).toBeGreaterThanOrEqual(m.y + m.alto);
    expect(caja.alto).toBeLessThanOrEqual(2 * m.alto);
    expect(c[1]).toStrictEqual({ metodo: "recorte-inferior", caja: { x: 0, y: 383, ancho: 1011, alto: 255 } });
  });

  it("LMI-01 Sin bandas, solo recorte inferior", () => {
    expect(localizarFranjaMrz(lienzo(1000, 600))).toStrictEqual([
      { metodo: "recorte-inferior", caja: { x: 0, y: 360, ancho: 1000, alto: 240 } },
      { metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: 1000, alto: 600 } },
    ]);
  });

  it("LMI-01 Dos bandas no bastan", async () => {
    const r = await render.render([P.lineas[0], P.lineas[1], ""]);
    const c = localizarFranjaMrz(pixelesPng(r.bytes));
    expect(c.map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01 Nunca lanza (fc.anything)", () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const r = localizarFranjaMrz(x);
        expect(Array.isArray(r)).toBe(true);
        expect(r).toStrictEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it("LMI-01 Nunca lanza (forma de píxeles) y vacío exactamente ante forma inválida", () => {
    const arb = fc.record({ width: fc.integer({ min: 0, max: 64 }), height: fc.integer({ min: 0, max: 64 }), data: fc.uint8Array({ maxLength: 16384 }) });
    fc.assert(
      fc.property(arb, (x) => {
        const valida = x.width > 0 && x.height > 0 && x.data.length === x.width * x.height * 4;
        const r = localizarFranjaMrz(x);
        expect(Array.isArray(r)).toBe(true);
        expect(r.length === 0).toBe(!valida);
      }),
      { numRuns: 500 },
    );
    // Formas válidas por construcción (el generador anterior casi nunca acierta la longitud exacta).
    const valido = fc
      .record({ width: fc.integer({ min: 1, max: 64 }), height: fc.integer({ min: 1, max: 64 }) })
      .chain(({ width, height }) => fc.record({ width: fc.constant(width), height: fc.constant(height), data: fc.uint8Array({ minLength: width * height * 4, maxLength: width * height * 4 }) }));
    fc.assert(
      fc.property(valido, (x) => {
        const r = localizarFranjaMrz(x);
        expect(r.length).toBeGreaterThanOrEqual(1);
        expect(r.at(-1)).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: x.width, alto: x.height } });
        expect(r.at(-2)?.metodo).toBe("recorte-inferior");
        for (const { caja } of r) {
          expect(caja.x).toBeGreaterThanOrEqual(0);
          expect(caja.y).toBeGreaterThanOrEqual(0);
          expect(caja.x + caja.ancho).toBeLessThanOrEqual(x.width);
          expect(caja.y + caja.alto).toBeLessThanOrEqual(x.height);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("LMI-01 Acepta Uint8Array y Uint8ClampedArray; rechaza lados no enteros o negativos", () => {
    const l = lienzo(10, 10);
    expect(localizarFranjaMrz({ ...l, data: new Uint8Array(l.data) })).toHaveLength(2);
    expect(localizarFranjaMrz({ ...l, width: 10.5 })).toStrictEqual([]);
    expect(localizarFranjaMrz({ ...l, height: -10 })).toStrictEqual([]);
    expect(localizarFranjaMrz({ ...l, data: Array.from(l.data) })).toStrictEqual([]);
    expect(localizarFranjaMrz(null)).toStrictEqual([]);
  });
});

describe("LMI-01b Criterio de la proyección", { timeout: 60_000 }, () => {
  const tres = [
    [50, 400, 900, 20],
    [50, 440, 900, 20],
    [50, 480, 900, 20],
  ] as const;

  it("LMI-01b Margen de la caja", () => {
    expect(localizarFranjaMrz(lienzo(1000, 600, tres))[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 40, y: 390, ancho: 920, alto: 120 } });
  });

  it("LMI-01b Bandas irregulares", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [tres[0], tres[1], [50, 480, 900, 40]]));
    expect(c.map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01b La caja se recorta a la imagen", () => {
    const c = localizarFranjaMrz(lienzo(100, 100, [[0, 60, 100, 6], [0, 74, 100, 6], [0, 88, 100, 6]]));
    expect(c[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 0, y: 57, ancho: 100, alto: 40 } });
  });

  it("LMI-01b Solo la mitad inferior cuenta", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 100, 900, 20], [50, 140, 900, 20], [50, 180, 900, 20]]));
    expect(c.map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01b Separaciones irregulares", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 400, 900, 20], [50, 440, 900, 20], [50, 520, 900, 20]]));
    expect(c.map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01b Con 4 bandas toma el trío inferior regular", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 310, 900, 60], ...tres]));
    expect(c[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 40, y: 390, ancho: 920, alto: 120 } });
  });

  it("LMI-01b Una fila con menos del 0,5 % del ancho en tinta no es banda", () => {
    // 4 píxeles de tinta en 1000 de ancho (0,4 %): ninguna banda.
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 400, 4, 20], [50, 440, 4, 20], [50, 480, 4, 20]]));
    expect(c.map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
    const d = localizarFranjaMrz(lienzo(1000, 600, [[50, 400, 5, 20], [50, 440, 5, 20], [50, 480, 5, 20]]));
    expect(d[0]?.metodo).toBe("proyeccion");
  });

  it("LMI-01b Límites de regularidad (alturas 35 %, separaciones 25 %)", () => {
    const b = (inicio: number, fin: number) => ({ inicio, fin });
    // Alturas 10, 10, 13: diferencia 3 < 0,35 * 11 = 3,85 -> regular; 10, 10, 14: 4 >= 4,03? 0,35 * 11,33 = 3,97 -> no.
    expect(bandasRegulares(b(0, 9), b(20, 29), b(40, 52))).toBe(true);
    expect(bandasRegulares(b(0, 9), b(20, 29), b(40, 53))).toBe(false);
    // Separaciones 20 y 24: |4| < 0,25 * 22 = 5,5 -> regular; 20 y 26: 6 >= 5,75 -> no.
    expect(bandasRegulares(b(0, 9), b(20, 29), b(44, 53))).toBe(true);
    expect(bandasRegulares(b(0, 9), b(20, 29), b(46, 55))).toBe(false);
  });

  it("LMI-01b Otsu: null con un solo nivel; separa dos niveles", () => {
    expect(umbralOtsu(new Uint8Array([7, 7, 7]))).toBeNull();
    expect(umbralOtsu(new Uint8Array([10, 10, 200, 200]))).toBe(10);
    expect(umbralOtsu(new Uint8Array([0, 0, 0, 100, 255, 255]))).toBe(100);
  });
});

describe("LMI-01b Piezas de la proyección (límites exactos)", { timeout: 60_000 }, () => {
  /** Oráculo independiente de Otsu: varianza entre clases calculada directamente para cada umbral. */
  function varianzaEntre(valores: Uint8Array, t: number): number {
    const fondo = Array.from(valores).filter((v) => v <= t);
    const frente = Array.from(valores).filter((v) => v > t);
    if (fondo.length === 0 || frente.length === 0) return 0;
    const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return fondo.length * frente.length * (media(fondo) - media(frente)) ** 2;
  }

  it("LMI-01b Otsu coincide con el oráculo de varianza entre clases", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 60 }), async (valores) => {
        const t = umbralOtsu(valores);
        const varianzas = Array.from({ length: 256 }, (_, i) => varianzaEntre(valores, i));
        const maxima = Math.max(...varianzas);
        if (maxima === 0) {
          expect(t).toBeNull();
          return;
        }
        expect(t).not.toBeNull();
        const eps = maxima * 1e-9;
        expect(varianzas[t ?? 0]).toBeGreaterThanOrEqual(maxima - eps);
        // Es el primer umbral que alcanza el máximo.
        expect(varianzas.slice(0, t ?? 0).every((v) => v < maxima - eps)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("LMI-01b Luminancia BT.601 entera", () => {
    const p = { width: 5, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]) };
    expect(Array.from(luminancias(p))).toStrictEqual([76, 149, 29, 255, 0]);
  });

  it("LMI-01b Forma válida de los píxeles", () => {
    const d = (n: number) => new Uint8ClampedArray(n);
    expect(esPixelesRgba({ width: 2, height: 3, data: d(24) })).toBe(true);
    expect(esPixelesRgba({ width: 2, height: 1.5, data: d(12) })).toBe(false);
    expect(esPixelesRgba({ width: 1.5, height: 2, data: d(12) })).toBe(false);
    expect(esPixelesRgba({ width: 0, height: 3, data: d(0) })).toBe(false);
    expect(esPixelesRgba({ width: 3, height: 0, data: d(0) })).toBe(false);
    expect(esPixelesRgba({ width: 2, height: 3, data: d(23) })).toBe(false);
    expect(esPixelesRgba({ width: "2", height: 3, data: d(24) })).toBe(false);
  });

  it("LMI-01b Igualdad en los límites: 35 % de alturas y 25 % de separaciones se rechazan", () => {
    const b = (inicio: number, fin: number) => ({ inicio, fin });
    // Alturas 53, 53 y 74: diferencia 21 = 0,35 * 60.
    expect(bandasRegulares(b(0, 52), b(100, 152), b(200, 273))).toBe(false);
    expect(bandasRegulares(b(0, 52), b(100, 152), b(200, 272))).toBe(true);
    // Separaciones 14 y 18 entre centros: |4| = 0,25 * 32 / 2.
    expect(bandasRegulares(b(0, 9), b(14, 23), b(32, 41))).toBe(false);
    expect(bandasRegulares(b(0, 9), b(14, 23), b(31, 40))).toBe(true);
  });

  it("LMI-01b Bandas que tocan el borde inferior y caja con anchos distintos", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 520, 900, 20], [30, 550, 900, 20], [70, 580, 900, 20]]));
    expect(c[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 20, y: 510, ancho: 960, alto: 90 } });
  });

  it("LMI-01b La mitad inferior empieza en floor(alto / 2)", () => {
    const c = localizarFranjaMrz(lienzo(1000, 601, [[50, 300, 900, 20], [50, 340, 900, 20], [50, 380, 900, 20]]));
    expect(c[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 40, y: 290, ancho: 920, alto: 120 } });
    const d = localizarFranjaMrz(lienzo(1000, 602, [[50, 300, 900, 20], [50, 340, 900, 20], [50, 380, 900, 20]]));
    // Con 602 filas la mitad empieza en 301: la primera banda pierde su primera fila.
    expect(d[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 40, y: 291, ancho: 920, alto: 119 } });
    const e = localizarFranjaMrz(lienzo(1000, 604, [[50, 300, 900, 20], [50, 340, 900, 20], [50, 380, 900, 20]]));
    expect(e[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 40, y: 292, ancho: 920, alto: 118 } });
  });
});

describe("LMI-10 Candidato de imagen completa", { timeout: 60_000 }, () => {
  it("LMI-10 Orden de candidatos en el reverso completo", async () => {
    const r = await render.render(P.lineas);
    const c = localizarFranjaMrz(pixelesPng(r.bytes));
    expect(c.map((x) => x.metodo)).toStrictEqual(["proyeccion", "recorte-inferior", "imagen-completa"]);
    expect(c.at(-1)).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: r.width, alto: r.height } });
  });

  it("LMI-10 Lienzo sin bandas: el último candidato es la imagen completa", () => {
    expect(localizarFranjaMrz(lienzo(37, 23)).at(-1)).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: 37, alto: 23 } });
  });
});
