// Cambio otros-documentos, OD-20 (tarea 2.1): la presencia distingue la MRZ TD1 (3x30) de la TD3 (2x44) en las 4
// orientaciones, sin superar el coste de OFF-22b. Escenas sintéticas en el frame de análisis de 640x360; datos de
// PERSONA_BASE, la CE de OD-10a y el pasaporte COL de OD-01 (sintéticos).
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { detectarPresencia } from "../../src/calidad/presencia.js";
import type { FrameAnalisis } from "../../src/calidad/tipos.js";
import { crearDetectorGuia, guiaEnAnalisis } from "../../src/flujo/guia.js";
import type { MensajeDelWorker } from "../../src/navegador/protocolo.js";
import { iniciarWorkerCalidad, type AlcanceWorker, type OpcionesWorkerCalidad } from "../../src/navegador/worker-calidad.js";
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

describe("OD-20 Contenido en la respuesta del Worker de calidad", { timeout: 60_000 }, () => {
  async function analizar(f: FrameAnalisis, opciones: OpcionesWorkerCalidad) {
    const recibidos: MensajeDelWorker[] = [];
    const alcance: AlcanceWorker = { onmessage: null, postMessage: (m) => void recibidos.push(m) };
    iniciarWorkerCalidad(alcance, crearDetectorGuia(), opciones);
    const pixeles = new Uint8ClampedArray(f.pixeles).buffer;
    alcance.onmessage?.({ data: { tipo: "analizar", id: 1, ancho: f.ancho, alto: f.alto, anchoOriginal: f.anchoOriginal, altoOriginal: f.altoOriginal, pixeles } } as MessageEvent);
    await expect.poll(() => recibidos.length).toBe(1);
    return (recibidos[0] as Extract<MensajeDelWorker, { tipo: "resultado" }>).contenido;
  }

  it("OD-20 con contenidoTd: pdf417, mrz-td1 (digital y CE) y mrz-td3 (pasaporte y girado 180)", async () => {
    const td = { presencia: true, contenidoTd: true } as const;
    expect(await analizar(tarjetaEnGuia(amarilla), td)).toBe("pdf417");
    expect(await analizar(tarjetaEnGuia(digital), td)).toBe("mrz-td1");
    expect(await analizar(tarjetaEnGuia(ce), td)).toBe("mrz-td1");
    expect(await analizar(documentoEnGuia(pasaporte), td)).toBe("mrz-td3");
    expect(await analizar(documentoEnGuia(girar90(girar90(pasaporte))), td)).toBe("mrz-td3");
  });

  it("OD-20 sin contenidoTd (consumidores aún no migrados): alias mrz y null para el TD3", async () => {
    expect(await analizar(tarjetaEnGuia(digital), { presencia: true })).toBe("mrz");
    expect(await analizar(documentoEnGuia(pasaporte), { presencia: true })).toBeNull();
  });
});
