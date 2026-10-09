// Cambio otros-documentos, OD-20 (tarea 2.1): la presencia distingue la MRZ TD1 (3x30) de la TD3 (2x44) en las 4
// orientaciones, sin superar el coste de OFF-22b. Escenas sintéticas en el frame de análisis de 640x360; datos de
// PERSONA_BASE, la CE de OD-10a y el pasaporte COL de OD-01 (sintéticos).
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { detectarPresencia } from "../../src/calidad/presencia.js";
import type { FrameAnalisis } from "../../src/calidad/tipos.js";
import { guiaEnAnalisis } from "../../src/flujo/guia.js";
import { pixelesSinteticos } from "../pdf417/sintetica.js";
import { CE_SINTETICA, PASAPORTE_COL } from "../../../parsers/test/ayudas/generador-mrz-icao.js";
import { cara, documentoEnGuia, girar90, hojaEnBlanco, type Imagen, pared, tarjetaEnGuia, tarjetaVerticalEnGuia, texto } from "./escenas-presencia.js";

let amarilla: Imagen;
let digital: Imagen;
let ce: Imagen;
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
    ce = await imagen(CE_SINTETICA);
    pasaporte = await imagen(PASAPORTE_COL);
  } finally {
    await render.cerrar();
  }
}, 60_000);

const presencia = (f: FrameAnalisis) => detectarPresencia(f, guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal));

describe("OD-20 Pista de formato desde la presencia", { timeout: 60_000 }, () => {
  it("OD-20 Contenido por documento: amarilla, digital, CE, pasaporte (ID-3) y pasaporte girado 180", () => {
    expect(pasaporte.width / pasaporte.height).toBeCloseTo(125 / 88, 2);
    expect(presencia(tarjetaEnGuia(amarilla))).toMatchObject({ presente: true, contenido: "pdf417" });
    expect(presencia(tarjetaEnGuia(digital))).toMatchObject({ presente: true, contenido: "mrz-td1" });
    expect(presencia(tarjetaEnGuia(ce))).toMatchObject({ presente: true, contenido: "mrz-td1" });
    expect(presencia(documentoEnGuia(pasaporte))).toMatchObject({ presente: true, contenido: "mrz-td3" });
    expect(presencia(documentoEnGuia(girar90(girar90(pasaporte))))).toMatchObject({ presente: true, contenido: "mrz-td3" });
  });

  it("OD-20 Pasaporte vertical (90 y 270): mrz-td3", () => {
    expect(presencia(tarjetaVerticalEnGuia(girar90(pasaporte)))).toMatchObject({ presente: true, contenido: "mrz-td3" });
    expect(presencia(tarjetaVerticalEnGuia(girar90(girar90(girar90(pasaporte)))))).toMatchObject({ presente: true, contenido: "mrz-td3" });
  });

  it("OD-20 Escenas sin documento siguen sin presencia con el detector TD3", () => {
    for (const [nombre, f] of [["cara", cara()], ["pared", pared()], ["hoja", hojaEnBlanco()], ["texto", texto()]] as const) {
      expect(presencia(f), nombre).toMatchObject({ presente: false, contenido: null });
    }
  });

  it("OD-20 Rendimiento: el coste de OFF-22b (< 250 ms) se mantiene con el pasaporte", () => {
    const medir = (f: FrameAnalisis) => {
      let minimo = Infinity;
      for (let i = 0; i < 10; i++) {
        const inicio = performance.now();
        presencia(f);
        minimo = Math.min(minimo, performance.now() - inicio);
      }
      return minimo;
    };
    expect(medir(documentoEnGuia(pasaporte))).toBeLessThan(250);
    expect(medir(documentoEnGuia(girar90(girar90(pasaporte))))).toBeLessThan(250);
    expect(medir(tarjetaEnGuia(girar90(girar90(digital))))).toBeLessThan(250);
  });
});
