// LMI-01 y LMI-01b (spec lectura-mrz-imagen): localización de la franja MRZ. Imágenes SINTÉTICAS: R se renderiza en
// el Chromium de Playwright con datos de @lector-cedula/fixtures; los lienzos de rectángulos son literales.
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { bandasRegulares, esPixelesRgba, girar, localizarFranjaMrz, luminancias, umbralOtsu } from "../../src/mrz/localizar.js";

const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
type Renderizador = Awaited<ReturnType<typeof crearRenderizador>>;
let render: Renderizador;

function pixelesPng(bytes: Uint8Array) {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

/** Candidatos de LMI-01 y LMI-10: excluye las franjas de LMI-11, añadidas después y probadas aparte. */
const sinFranjas = (c: ReturnType<typeof localizarFranjaMrz>) => c.filter((x) => x.metodo !== "franja");

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
    expect(sinFranjas(localizarFranjaMrz(lienzo(1000, 600)))).toStrictEqual([
      { metodo: "recorte-inferior", caja: { x: 0, y: 360, ancho: 1000, alto: 240 } },
      { metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: 1000, alto: 600 } },
    ]);
  });

  it("LMI-01 Dos bandas no bastan", async () => {
    const r = await render.render([P.lineas[0], P.lineas[1], ""]);
    const c = localizarFranjaMrz(pixelesPng(r.bytes));
    expect(sinFranjas(c).map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
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
        const base = sinFranjas(r);
        expect(base.at(-1)).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: x.width, alto: x.height } });
        expect(base.at(-2)?.metodo).toBe("recorte-inferior");
        // Las franjas (LMI-11) van todas después de imagen-completa.
        expect(r.slice(0, base.length)).toStrictEqual(base);
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
    expect(localizarFranjaMrz({ ...l, data: new Uint8Array(l.data) })).toStrictEqual(localizarFranjaMrz(l));
    expect(sinFranjas(localizarFranjaMrz(l))).toHaveLength(2);
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
    expect(sinFranjas(c).map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01b La caja se recorta a la imagen", () => {
    const c = localizarFranjaMrz(lienzo(100, 100, [[0, 60, 100, 6], [0, 74, 100, 6], [0, 88, 100, 6]]));
    expect(c[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 0, y: 57, ancho: 100, alto: 40 } });
  });

  it("LMI-01b Solo la mitad inferior cuenta", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 100, 900, 20], [50, 140, 900, 20], [50, 180, 900, 20]]));
    expect(sinFranjas(c).map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01b Separaciones irregulares", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 400, 900, 20], [50, 440, 900, 20], [50, 520, 900, 20]]));
    expect(sinFranjas(c).map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
  });

  it("LMI-01b Con 4 bandas toma el trío inferior regular", () => {
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 310, 900, 60], ...tres]));
    expect(c[0]).toStrictEqual({ metodo: "proyeccion", caja: { x: 40, y: 390, ancho: 920, alto: 120 } });
  });

  it("LMI-01b Una fila con menos del 0,5 % del ancho en tinta no es banda", () => {
    // 4 píxeles de tinta en 1000 de ancho (0,4 %): ninguna banda.
    const c = localizarFranjaMrz(lienzo(1000, 600, [[50, 400, 4, 20], [50, 440, 4, 20], [50, 480, 4, 20]]));
    expect(sinFranjas(c).map((x) => x.metodo)).toStrictEqual(["recorte-inferior", "imagen-completa"]);
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

  it("LMI-01b Un solo nivel y dos niveles", () => {
    expect(umbralOtsu(new Uint8Array([7, 7, 7]))).toBeNull();
    expect(umbralOtsu(new Uint8Array([10, 10, 200, 200]))).toBe(10);
    expect(umbralOtsu(new Uint8Array([0, 0, 0, 100, 255, 255]))).toBe(100);
  });
});

describe("LMI-01b Piezas de la proyección (límites exactos)", { timeout: 60_000 }, () => {
  /**
   * Oráculo independiente y exacto de Otsu: para cada umbral separa las clases por filtrado y da la varianza entre clases
   * n0 * n1 * (m0 - m1)^2 como fracción de BigInt [numerador, denominador] con m = suma / n, sin dividir.
   */
  function varianzaEntre(valores: Uint8Array, t: number): readonly [bigint, bigint] {
    const fondo = Array.from(valores).filter((v) => v <= t);
    const frente = Array.from(valores).filter((v) => v > t);
    if (fondo.length === 0 || frente.length === 0) return [0n, 1n];
    const suma = (xs: number[]) => BigInt(xs.reduce((a, b) => a + b, 0));
    const n0 = BigInt(fondo.length);
    const n1 = BigInt(frente.length);
    // m0 - m1 = (s0 * n1 - s1 * n0) / (n0 * n1); por n0 * n1 queda (s0 * n1 - s1 * n0)^2 / (n0 * n1).
    const dif = suma(fondo) * n1 - suma(frente) * n0;
    return [dif * dif, n0 * n1];
  }
  const mayor = (a: readonly [bigint, bigint], b: readonly [bigint, bigint]) => a[0] * b[1] > b[0] * a[1];

  it("LMI-01b Empate en la varianza entre clases: gana el umbral más bajo", () => {
    // Contraejemplo de fast-check (semilla -1808592412): 109 y 146 empatan con 361250 / 3.
    const valores = new Uint8Array([245, 109, 146, 217, 13]);
    const [n109, d109] = varianzaEntre(valores, 109);
    const [n146, d146] = varianzaEntre(valores, 146);
    expect(n109 * 3n).toBe(361250n * d109);
    expect(n146 * 3n).toBe(361250n * d146);
    expect(umbralOtsu(valores)).toBe(109);
  });

  it("LMI-01b Otsu coincide con el oráculo exacto de varianza entre clases", async () => {
    let conTinta = 0;
    const numRuns = Number(process.env["OTSU_NUM_RUNS"] ?? 1000);
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 60 }), async (valores) => {
        const varianzas = Array.from({ length: 256 }, (_, i) => varianzaEntre(valores, i));
        // Primer umbral que alcanza el máximo (solo lo reemplaza uno estrictamente mayor).
        let primero = 0;
        for (let i = 1; i < 256; i++) if (mayor(varianzas[i] as readonly [bigint, bigint], varianzas[primero] as readonly [bigint, bigint])) primero = i;
        const esperado = (varianzas[primero] as readonly [bigint, bigint])[0] === 0n ? null : primero;
        if (esperado !== null) conTinta++;
        expect(umbralOtsu(valores)).toBe(esperado);
      }),
      { numRuns },
    );
    // Propiedad no vacía: la gran mayoría de los casos tiene dos niveles o más.
    expect(conTinta / numRuns).toBeGreaterThan(0.5);
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
    expect(c.slice(0, 3).map((x) => x.metodo)).toStrictEqual(["proyeccion", "recorte-inferior", "imagen-completa"]);
    expect(c.slice(3).every((x) => x.metodo === "franja")).toBe(true);
    expect(c[2]).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: r.width, alto: r.height } });
  });

  it("LMI-10 Lienzo sin bandas: imagen completa justo después del recorte inferior", () => {
    expect(localizarFranjaMrz(lienzo(37, 23))[1]).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: 37, alto: 23 } });
  });
});

describe("LMI-11 Franjas horizontales", { timeout: 60_000 }, () => {
  it("LMI-11 Primera franja de cada altura pegada al borde inferior (atrapa: franjas de arriba abajo, alturas o paso distintos)", () => {
    const franjas = localizarFranjaMrz(lienzo(1000, 1000)).filter((c) => c.metodo === "franja");
    // Oráculo literal: altos 150, 300 y 450; paso 50; de abajo arriba; lienzo sin bordes, sin ajuste.
    const esperadas = [150, 300, 450].flatMap((a) =>
      Array.from({ length: (1000 - a) / 50 + 1 }, (_, k) => ({ metodo: "franja", caja: { x: 0, y: 1000 - a - 50 * k, ancho: 1000, alto: a } })),
    );
    expect(franjas).toStrictEqual(esperadas);
    expect(franjas[0]).toStrictEqual({ metodo: "franja", caja: { x: 0, y: 850, ancho: 1000, alto: 150 } });
    expect(franjas[1]).toStrictEqual({ metodo: "franja", caja: { x: 0, y: 800, ancho: 1000, alto: 150 } });
    expect(franjas[18]).toStrictEqual({ metodo: "franja", caja: { x: 0, y: 700, ancho: 1000, alto: 300 } });
    expect(franjas[33]).toStrictEqual({ metodo: "franja", caja: { x: 0, y: 550, ancho: 1000, alto: 450 } });
  });

  it("LMI-11 Sin repetir cajas cuando el paso no divide el alto", () => {
    const franjas = localizarFranjaMrz(lienzo(10, 37)).filter((c) => c.metodo === "franja");
    for (const a of [6, 11, 17]) {
      const ys = franjas.filter((c) => c.caja.alto === a).map((c) => c.caja.y);
      expect(new Set(ys).size).toBe(ys.length);
      expect(ys[0]).toBe(37 - a);
      expect(ys.at(-1)).toBe(0);
    }
  });

  it("LMI-11 Las franjas van después de imagen-completa (atrapa: franjas antes que los candidatos de LMI-01)", () => {
    const metodos = localizarFranjaMrz(lienzo(1000, 1000)).map((c) => c.metodo);
    expect(metodos.indexOf("franja")).toBeGreaterThan(metodos.indexOf("imagen-completa"));
  });

  /** 3 líneas de 40 "caracteres" de 10x15 px separados 10 px, en y = 900, 930 y 960. */
  const texto = [900, 930, 960].flatMap((y) => Array.from({ length: 40 }, (_, k) => [100 + 20 * k, y, 10, 15] as const));

  it("LMI-11 La franja se ajusta al trío de líneas por bordes horizontales", () => {
    const franjas = localizarFranjaMrz(lienzo(1000, 1000, texto)).filter((c) => c.metodo === "franja");
    // Bordes en x = 99 ... 889; margen round(15 / 2) = 8; bandas locales 50-64, 80-94 y 110-124 de la franja y = 850.
    expect(franjas[0]).toStrictEqual({ metodo: "franja", caja: { x: 91, y: 892, ancho: 807, alto: 91 } });
  });

  it("LMI-11 Ignora las columnas de fondo con bordes en casi todas las filas (atrapa: textura que tapa las líneas)", () => {
    const vetas = Array.from({ length: 20 }, (_, k) => [2 * k, 0, 1, 1000] as const);
    const franjas = localizarFranjaMrz(lienzo(1000, 1000, [...vetas, ...texto])).filter((c) => c.metodo === "franja");
    expect(franjas[0]).toStrictEqual({ metodo: "franja", caja: { x: 91, y: 892, ancho: 807, alto: 91 } });
  });
});

describe("LMI-12 Giro de la imagen", () => {
  it("LMI-12 girar 90 y 270 en sentido horario, sin modificar la entrada", () => {
    // 3x2: valores 0..5 en el canal R por filas.
    const p = { width: 3, height: 2, data: new Uint8ClampedArray([0, 1, 2, 3, 4, 5].flatMap((v) => [v, 0, 0, 255])) };
    const copia = new Uint8ClampedArray(p.data);
    const r = (q: { data: Uint8ClampedArray | Uint8Array }) => Array.from(q.data).filter((_, i) => i % 4 === 0);
    const g90 = girar(p, 90);
    expect([g90.width, g90.height]).toStrictEqual([2, 3]);
    expect(r(g90)).toStrictEqual([3, 0, 4, 1, 5, 2]);
    const g270 = girar(p, 270);
    expect([g270.width, g270.height]).toStrictEqual([2, 3]);
    expect(r(g270)).toStrictEqual([2, 5, 1, 4, 0, 3]);
    expect(Array.from(g90.data).filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
    expect(p.data).toStrictEqual(copia);
    expect(r(girar(girar(p, 90), 270))).toStrictEqual(r(p));
  });

  it("LMI-12 girar 180 (mrz-giro-180): mismas dimensiones, píxeles invertidos, alfa intacto y entrada sin modificar", () => {
    const p = { width: 3, height: 2, data: new Uint8ClampedArray([0, 1, 2, 3, 4, 5].flatMap((v) => [v, 10 + v, 20 + v, 255])) };
    const copia = new Uint8ClampedArray(p.data);
    const g = girar(p, 180);
    expect([g.width, g.height]).toStrictEqual([3, 2]);
    expect(Array.from(g.data)).toStrictEqual([5, 4, 3, 2, 1, 0].flatMap((v) => [v, 10 + v, 20 + v, 255]));
    expect(p.data).toStrictEqual(copia);
    expect(Array.from(girar(girar(p, 90), 90).data)).toStrictEqual(Array.from(g.data));
  });
});
