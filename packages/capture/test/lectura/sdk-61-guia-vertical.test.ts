// sdk-integracion, SDK-61: guía ID-1 vertical (cédula de pie) y guía elegida por el llamador (zona visible). La
// presencia y la calidad del Worker se evalúan dentro de esa guía. Escenas sintéticas de 640x360 (PERSONA_BASE y el
// pasaporte COL de OD-01); ningún dato real.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import type { FrameAnalisis } from "../../src/calidad/tipos.js";
import { calcularGuia, calcularGuiaEnRegion, crearDetectorGuia, guiaEnAnalisis, PROPORCION_ID1, type Caja } from "../../src/flujo/guia.js";
import type { MensajeDelWorker } from "../../src/navegador/protocolo.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";
import { pixelesSinteticos } from "../pdf417/sintetica.js";
import { PASAPORTE_COL } from "../../../parsers/test/ayudas/generador-mrz-icao.js";
import { girar90, type Imagen, tarjetaVerticalEnGuia } from "./escenas-presencia.js";

let amarilla: Imagen;
let digital: Imagen;
let pasaporte: Imagen;

beforeAll(async () => {
  amarilla = await pixelesSinteticos(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const render = await crearRenderizador();
  const imagen = async (lineas: readonly string[]): Promise<Imagen> => {
    const png = PNG.sync.read(Buffer.from((await render.render(lineas)).bytes));
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  };
  try {
    digital = await imagen(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas);
    pasaporte = await imagen(PASAPORTE_COL);
  } finally {
    await render.cerrar();
  }
}, 60_000);

const VERTICAL_1080P = { x: 654, y: 54, ancho: 613, alto: 972 };

function worker() {
  const recibidos: MensajeDelWorker[] = [];
  const alcance: AlcanceWorker = { onmessage: null, postMessage: (m) => void recibidos.push(m) };
  iniciarWorkerCalidad(alcance, crearDetectorGuia(), { presencia: true, contenidoTd: true });
  return async (f: FrameAnalisis, guia?: unknown): Promise<MensajeDelWorker> => {
    const n = recibidos.length;
    const pixeles = new Uint8ClampedArray(f.pixeles).buffer;
    const datos = { tipo: "analizar", id: n + 1, ancho: f.ancho, alto: f.alto, anchoOriginal: f.anchoOriginal, altoOriginal: f.altoOriginal, pixeles, ...(guia === undefined ? {} : { guia }) };
    alcance.onmessage?.({ data: datos } as MessageEvent);
    await expect.poll(() => recibidos.length, { timeout: 30_000 }).toBe(n + 1);
    return recibidos[n] as MensajeDelWorker;
  };
}

describe("SDK-61 Guía vertical y guía del llamador", { timeout: 60_000 }, () => {
  it("SDK-61 Guía vertical en un frame horizontal de 1080p", () => {
    expect(calcularGuia(1920, 1080, { orientacion: "vertical" })).toStrictEqual(VERTICAL_1080P);
    // Horizontal forzada en un frame vertical: lado largo horizontal, limitado por el ancho.
    expect(calcularGuia(1080, 1920, { orientacion: "horizontal" })).toStrictEqual({ x: 54, y: 654, ancho: 972, alto: 613 });
    // Sin opciones, CAM-08 no cambia (lado largo paralelo al del frame).
    expect(calcularGuia(1920, 1080)).toStrictEqual({ x: 190, y: 54, ancho: 1541, alto: 972 });
  });

  it("SDK-61 Margen configurable", () => {
    expect(calcularGuia(1000, 1000, { orientacion: "vertical", margen: 0.1 })).toStrictEqual({ x: 248, y: 100, ancho: 504, alto: 800 });
    expect(calcularGuia(1920, 1080, { orientacion: "horizontal", margen: 0.05 })).toStrictEqual(calcularGuia(1920, 1080));
  });

  it("SDK-61 Guía dentro de una región (zona visible tras cover)", () => {
    expect(calcularGuiaEnRegion({ x: 609, y: 0, ancho: 702, alto: 1080 }, { orientacion: "vertical" })).toStrictEqual({ x: 609 + 45, y: 54, ancho: 613, alto: 972 });
  });

  it("SDK-61 Propiedad: proporción ID-1 en la orientación pedida, centrada y dentro del margen", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 4096 }),
        fc.integer({ min: 320, max: 4096 }),
        fc.constantFrom("horizontal" as const, "vertical" as const),
        fc.double({ min: 0, max: 0.25, noNaN: true }),
        (W, H, orientacion, margen) => {
          const g = calcularGuia(W, H, { orientacion, margen });
          expect(g.ancho).toBeLessThanOrEqual((1 - 2 * margen) * W + 0.5);
          expect(g.alto).toBeLessThanOrEqual((1 - 2 * margen) * H + 0.5);
          expect(g.x).toBeGreaterThanOrEqual(0);
          expect(g.y).toBeGreaterThanOrEqual(0);
          const p = orientacion === "horizontal" ? g.ancho / g.alto : g.alto / g.ancho;
          expect(Math.abs(p - PROPORCION_ID1) / PROPORCION_ID1).toBeLessThan(0.01);
          expect(Math.abs(g.x - (W - g.x - g.ancho))).toBeLessThanOrEqual(1);
          expect(Math.abs(g.y - (H - g.y - g.alto))).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it("SDK-61 El detector usa la guía del frame", () => {
    const frame = { ancho: 640, alto: 360, anchoOriginal: 1920, altoOriginal: 1080, pixeles: new Uint8ClampedArray(640 * 360 * 4), guia: VERTICAL_1080P };
    expect(crearDetectorGuia().detectar(frame)).toStrictEqual({ cuadrilatero: guiaEnAnalisis(640, 360, 1920, 1080, VERTICAL_1080P), confianza: null, fuente: "guia" });
    expect(guiaEnAnalisis(640, 360, 1920, 1080, VERTICAL_1080P)[0]).toStrictEqual([218, 18]);
  });

  it("SDK-61 Amarilla, digital y pasaporte de pie en la guía vertical: presentes con su contenido", async () => {
    const analizar = worker();
    const casos: [Imagen, string][] = [
      [girar90(amarilla), "pdf417"],
      [girar90(digital), "mrz-td1"],
      [girar90(girar90(girar90(digital))), "mrz-td1"],
      [girar90(pasaporte), "mrz-td3"],
    ];
    for (const [img, contenido] of casos) {
      const m = await analizar(tarjetaVerticalEnGuia(img), VERTICAL_1080P);
      expect(m).toMatchObject({ tipo: "resultado", contenido });
      expect((m as Extract<MensajeDelWorker, { tipo: "resultado" }>).resultado.score).toBeGreaterThanOrEqual(70);
    }
  });

  it("SDK-61 La presencia se evalúa dentro de la guía: tarjeta fuera de ella, sin documento", async () => {
    const analizar = worker();
    const fuera: Caja = { x: 0, y: 54, ancho: 420, alto: 972 };
    const m = await analizar(tarjetaVerticalEnGuia(girar90(amarilla)), fuera);
    expect(m).toMatchObject({ tipo: "resultado", contenido: null });
    expect((m as Extract<MensajeDelWorker, { tipo: "resultado" }>).resultado.score).toBeLessThan(70);
  });

  it("SDK-61 Guía fuera del frame o mal formada: frame-invalido", async () => {
    const analizar = worker();
    const f = tarjetaVerticalEnGuia(girar90(amarilla));
    for (const g of [{ x: 1500, y: 0, ancho: 613, alto: 972 }, { x: 0, y: 0, ancho: -1, alto: 10 }, { x: Number.NaN, y: 0, ancho: 1, alto: 1 }, "guia"]) {
      expect(await analizar(f, g)).toMatchObject({ tipo: "error", codigo: "frame-invalido" });
    }
  });
});
