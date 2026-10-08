// OFF-22 Presencia de documento antes de listo (pwa-lectura-offline): tarjeta con proporción ID-1 y contenido PDF417 o
// MRZ. Escenas sintéticas en el frame de análisis de 640x360. Datos de PERSONA_BASE (semilla 1).
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { aplicarPresencia, detectarPresencia } from "../../src/calidad/presencia.js";
import type { FrameAnalisis, ResultadoCalidad } from "../../src/calidad/tipos.js";
import { guiaEnAnalisis } from "../../src/flujo/guia.js";
import { pixelesSinteticos } from "../pdf417/sintetica.js";
import { cara, girar90, hojaEnBlanco, type Imagen, pared, tarjetaEnGuia, tarjetaVerticalEnGuia, texto } from "./escenas-presencia.js";

let amarilla: Imagen;
let digital: Imagen;

beforeAll(async () => {
  amarilla = await pixelesSinteticos(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const render = await crearRenderizador();
  try {
    const png = PNG.sync.read(Buffer.from((await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes));
    digital = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  } finally {
    await render.cerrar();
  }
}, 60_000);

const presencia = (f: FrameAnalisis) => detectarPresencia(f, guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal));

describe("OFF-22 Presencia de documento", { timeout: 60_000 }, () => {
  it("OFF-22 Cédulas sintéticas: amarilla (PDF417), digital y digital girada (MRZ)", () => {
    expect(presencia(tarjetaEnGuia(amarilla))).toMatchObject({ presente: true, contenido: "pdf417" });
    expect(presencia(tarjetaEnGuia(digital))).toMatchObject({ presente: true, contenido: "mrz" });
    expect(presencia(tarjetaVerticalEnGuia(girar90(digital)))).toMatchObject({ presente: true, contenido: "mrz" });
  });

  it("OFF-22 Escenas sin cédula nítidas: cara, pared, hoja en blanco y texto cualquiera", () => {
    for (const [nombre, f] of [["cara", cara()], ["pared", pared()], ["hoja", hojaEnBlanco()], ["texto", texto()]] as const) {
      expect(presencia(f).presente, nombre).toBe(false);
    }
    expect(presencia(hojaEnBlanco()).tarjeta).not.toBeNull();
  });

  it("OFF-22 Rápido: < 20 ms por frame sin tarjeta y < 150 ms con búsqueda de MRZ (solo en frames que superan el umbral)", () => {
    // Mínimo de 10 ejecuciones: mide el coste del algoritmo, no la contención de otras pruebas en paralelo.
    const medir = (f: FrameAnalisis) => {
      let minimo = Infinity;
      for (let i = 0; i < 10; i++) {
        const inicio = performance.now();
        presencia(f);
        minimo = Math.min(minimo, performance.now() - inicio);
      }
      return minimo;
    };
    expect(medir(cara())).toBeLessThan(20);
    expect(medir(tarjetaEnGuia(amarilla))).toBeLessThan(20);
    expect(medir(tarjetaEnGuia(digital))).toBeLessThan(150);
  });

  it("OFF-22 aplicarPresencia: sin documento nunca llega al umbral; con documento o por debajo no cambia", () => {
    const r = { score: 90, motivo: null, metricas: null } as unknown as ResultadoCalidad;
    expect(aplicarPresencia(r, false, 70)).toStrictEqual({ score: 69, motivo: "acerca", metricas: null });
    expect(aplicarPresencia(r, true, 70)).toBe(r);
    const bajo = { ...r, score: 40, motivo: "desenfocado" } as ResultadoCalidad;
    expect(aplicarPresencia(bajo, false, 70)).toBe(bajo);
    const justo = { ...r, score: 70 } as ResultadoCalidad;
    expect(aplicarPresencia(justo, false, 70).score).toBe(69);
  });

  it("OFF-22 recorte degenerado o tarjeta sin proporción ID-1: sin presencia", () => {
    const f = tarjetaEnGuia(amarilla);
    expect(detectarPresencia(f, [[0, 0], [3, 0], [3, 3], [0, 3]])).toStrictEqual({ tarjeta: null, contenido: null, presente: false });
  });
});
