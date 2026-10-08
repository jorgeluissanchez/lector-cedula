// LMI-14, LMI-14a y LMI-14b (cambio mrz-orientacion): evidencia de MRZ horizontal por vista y orden de vistas.
// Imágenes SINTÉTICAS en memoria (rectángulos y el reverso R de @lector-cedula/fixtures).
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { crearLectorMrz, planIntentosMrz, type WorkerOcr } from "../../src/mrz/lector.js";
import { analizarVentana, esTrioMrzHorizontal, girar, localizarConEvidencia, localizarFranjaMrz, luminancias, type PixelesRgba } from "../../src/mrz/localizar.js";

const REF = { fechaReferencia: "2026-10-06" };
const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
let R: PixelesRgba;

function blanco(w = 1000, h = 1000): PixelesRgba {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
}

/** Escenario de LMI-11b: 3 líneas de 40 rectángulos negros de 10x15 en y = 900, 930 y 960, desde x = 100. */
function rectangulos(): PixelesRgba {
  const p = blanco();
  for (const y0 of [900, 930, 960]) {
    for (let k = 0; k < 40; k++) {
      for (let y = y0; y < y0 + 15; y++) {
        for (let x = 100 + 20 * k; x < 110 + 20 * k; x++) p.data.fill(0, (y * 1000 + x) * 4, (y * 1000 + x) * 4 + 3);
      }
    }
  }
  return p;
}

const giros = (p: PixelesRgba): number[] => planIntentosMrz(p).map((i) => i.giro);
/** Giros en el orden en que aparecen por primera vez en el plan. */
const ordenVistas = (p: PixelesRgba): number[] => [...new Set(giros(p))];

beforeAll(async () => {
  const render = await crearRenderizador();
  const png = PNG.sync.read(Buffer.from((await render.render(P.lineas)).bytes));
  R = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  await render.cerrar();
}, 60_000);

describe("LMI-14 Trío de MRZ horizontal", { timeout: 60_000 }, () => {
  it("LMI-14 Líneas de rectángulos", () => {
    expect(esTrioMrzHorizontal({ tramos: [80, 80, 80], altoMedio: 15, ancho: 791 })).toBe(true);
  });

  it("LMI-14 Límites del criterio", () => {
    // 20 tramos es el mínimo; t * a / w en [0,5; 2,5] con extremos incluidos.
    expect(esTrioMrzHorizontal({ tramos: [20, 20, 20], altoMedio: 10, ancho: 200 })).toBe(true);
    expect(esTrioMrzHorizontal({ tramos: [20, 19, 20], altoMedio: 10, ancho: 190 })).toBe(false);
    expect(esTrioMrzHorizontal({ tramos: [25, 25, 25], altoMedio: 10, ancho: 500 })).toBe(true);
    expect(esTrioMrzHorizontal({ tramos: [25, 25, 25], altoMedio: 10, ancho: 501 })).toBe(false);
    expect(esTrioMrzHorizontal({ tramos: [25, 25, 25], altoMedio: 10, ancho: 100 })).toBe(true);
    expect(esTrioMrzHorizontal({ tramos: [25, 25, 25], altoMedio: 10, ancho: 99 })).toBe(false);
  });
});

describe("LMI-14a Evidencia de orientación por vista", { timeout: 60_000 }, () => {
  it("LMI-14a Evidencia en tres líneas de rectángulos", () => {
    const p = rectangulos();
    const r = localizarConEvidencia(p);
    expect(r.evidencia).not.toBeNull();
    expect(r.evidencia as number).toBeGreaterThan(0.8);
    expect(r.candidatos).toStrictEqual(localizarFranjaMrz(p));
  });

  it("LMI-14a Sin evidencia", () => {
    expect(localizarConEvidencia(blanco()).evidencia).toBeNull();
    expect(localizarConEvidencia(girar(rectangulos(), 90)).evidencia).toBeNull();
    expect(localizarConEvidencia(null)).toStrictEqual({ candidatos: [], evidencia: null });
  });
});

describe("LMI-14b Orden de vistas por evidencia", { timeout: 60_000 }, () => {
  it("LMI-14b Vista derecha primero sin evidencia en ninguna vista", () => {
    expect(ordenVistas(blanco())).toStrictEqual([0, 90, 270]);
  });

  it("LMI-14b Vista derecha primero cuando tiene evidencia", () => {
    expect(localizarConEvidencia(R).evidencia).not.toBeNull();
    expect(ordenVistas(R)).toStrictEqual([0, 90, 270]);
  });

  it("LMI-14b MRZ a la izquierda", async () => {
    const p = girar(rectangulos(), 90);
    expect(ordenVistas(p)[0]).toBe(270);
    let llamadas = 0;
    const lector = crearLectorMrz({
      rutaModelo: "/modelo-falso",
      crearWorker: async (): Promise<WorkerOcr> => ({
        setParameters: async () => undefined,
        recognize: async () => (llamadas++, { data: { text: P.lineasSinErrores.join("\n") } }),
        terminate: async () => undefined,
      }),
    });
    const r = await lector.leer(p, REF);
    await lector.terminar();
    expect(r.ok && r.intento.endsWith("@270")).toBe(true);
    expect(llamadas).toBe(1);
  });

  it("LMI-14b MRZ a la derecha", () => {
    expect(ordenVistas(girar(rectangulos(), 270))[0]).toBe(90);
  });
});

describe("LMI-11c Trío cortado por el borde de la ventana", { timeout: 60_000 }, () => {
  it("LMI-11c Ventana que corta la tercera línea", () => {
    const p = blanco();
    for (const y0 of [875, 905, 935]) {
      for (let k = 0; k < 40; k++) {
        for (let y = y0; y < y0 + 20; y++) {
          for (let x = 100 + 20 * k; x < 110 + 20 * k; x++) p.data.fill(0, (y * 1000 + x) * 4, (y * 1000 + x) * 4 + 3);
        }
      }
    }
    const franjas = localizarFranjaMrz(p).filter((c) => c.metodo === "franja");
    expect(franjas.slice(0, 2).map((c) => c.caja)).toStrictEqual([
      { x: 89, y: 865, ancho: 811, alto: 100 },
      { x: 0, y: 800, ancho: 1000, alto: 150 },
    ]);
  });
});

describe("LMI-11d Recorte horizontal de la franja al bloque de texto", { timeout: 60_000 }, () => {
  it("LMI-11d Barra vertical junto a las líneas", () => {
    const p = rectangulos();
    for (let y = 900; y <= 975; y++) for (let x = 40; x <= 45; x++) p.data.fill(0, (y * 1000 + x) * 4, (y * 1000 + x) * 4 + 3);
    const franja = localizarFranjaMrz(p).find((c) => c.metodo === "franja");
    expect(franja?.caja).toStrictEqual({ x: 91, y: 892, ancho: 807, alto: 91 });
  });
});

describe("LMI-11e y LMI-11f Umbral de borde relativo y diagnóstico de ventana", { timeout: 60_000 }, () => {
  it("LMI-11e Líneas de poco contraste", () => {
    const p = rectangulos();
    for (let i = 0; i < p.data.length; i += 4) if (p.data[i] === 0) p.data.fill(225, i, i + 3);
    const franja = localizarFranjaMrz(p).find((c) => c.metodo === "franja");
    expect(franja?.caja).toStrictEqual({ x: 91, y: 892, ancho: 807, alto: 91 });
    const r = analizarVentana(luminancias(p), 1000, { metodo: "franja", caja: { x: 0, y: 850, ancho: 1000, alto: 150 } });
    expect([r.umbral, r.motivo]).toStrictEqual([15, "trio"]);
  });

  it("LMI-11f Texto nítido conserva el umbral", () => {
    const r = analizarVentana(luminancias(rectangulos()), 1000, { metodo: "franja", caja: { x: 0, y: 850, ancho: 1000, alto: 150 } });
    expect([r.umbral, r.motivo, r.bandas]).toStrictEqual([40, "trio", 3]);
  });

  it("LMI-11f Ventana sin tinta", () => {
    const r = analizarVentana(luminancias(blanco()), 1000, { metodo: "franja", caja: { x: 0, y: 850, ancho: 1000, alto: 150 } });
    expect([r.umbral, r.motivo, r.bandas, r.medidas]).toStrictEqual([12, "menos-de-3-bandas", 0, null]);
  });
});
