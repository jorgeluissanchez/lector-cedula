// OFF-25 Captura guiada por la presencia de la cédula y OFF-22 con frames degradados (pwa-lectura-offline). Cédulas
// sintéticas de PERSONA_BASE (semilla 1) degradadas como la cámara de un celular real: desenfoque gaussiano, ruido y
// JPEG de calidad 50. Calibración (solo números) en docs/decisiones/2026-10-07-captura-guiada-nitidez.md.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { detectarPresencia, evaluarConPresencia, LAPLACIANO_MINIMO_GUIADO } from "../../src/calidad/presencia.js";
import type { FrameAnalisis, ResultadoCalidad } from "../../src/calidad/tipos.js";
import { crearDetectorGuia, guiaEnAnalisis } from "../../src/flujo/guia.js";
import type { MensajeDelWorker } from "../../src/navegador/protocolo.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";
import { pixelesSinteticos } from "../pdf417/sintetica.js";
import { cara, degradar, girar90, hojaEnBlanco, type Imagen, pared, tarjetaEnGuia, tarjetaVerticalEnGuia, texto } from "./escenas-presencia.js";

const DEGRADACION = { calidadJpeg: 50, ruido: 4 } as const;
let amarilla: Imagen;
let digital: Imagen;
let cedulas: Record<"amarilla" | "digital" | "vertical", FrameAnalisis>;

beforeAll(async () => {
  amarilla = await pixelesSinteticos(generarPdf417(PERSONA_BASE, { semilla: 1 }).bytes);
  const render = await crearRenderizador();
  try {
    const png = PNG.sync.read(Buffer.from((await render.render(generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas)).bytes));
    digital = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  } finally {
    await render.cerrar();
  }
  cedulas = {
    amarilla: await degradar(tarjetaEnGuia(amarilla, 0.2), { sigma: 1, ...DEGRADACION }),
    digital: await degradar(tarjetaEnGuia(digital), { sigma: 1.5, ...DEGRADACION }),
    vertical: await degradar(tarjetaVerticalEnGuia(girar90(digital)), { sigma: 1, ...DEGRADACION }),
  };
}, 120_000);

type Resultado = Extract<MensajeDelWorker, { tipo: "resultado" }>;

async function analizar(f: FrameAnalisis, presencia: boolean): Promise<Resultado> {
  const recibidos: MensajeDelWorker[] = [];
  const alcance: AlcanceWorker = { onmessage: null, postMessage: (m) => void recibidos.push(m) };
  iniciarWorkerCalidad(alcance, crearDetectorGuia(), { presencia });
  const pixeles = new Uint8ClampedArray(f.pixeles).buffer;
  alcance.onmessage?.({ data: { tipo: "analizar", id: 1, ancho: f.ancho, alto: f.alto, anchoOriginal: f.anchoOriginal, altoOriginal: f.altoOriginal, pixeles } } as MessageEvent);
  await expect.poll(() => recibidos.length).toBe(1);
  return recibidos[0] as Resultado;
}

const varianza = (r: Resultado) => r.resultado.metricas?.nitidez.varianza ?? -1;
const sinCedula = async () => ({ cara: cara(), pared: pared(), hoja: hojaEnBlanco(), texto: texto() });

describe("OFF-25 Captura guiada por la presencia", { timeout: 60_000 }, () => {
  it("OFF-22 Cédulas sintéticas degradadas y escenas degradadas: presencia solo en las cédulas", async () => {
    for (const [nombre, f] of Object.entries(cedulas)) {
      expect(detectarPresencia(f, guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal)).presente, nombre).toBe(true);
    }
    for (const [nombre, f0] of Object.entries(await sinCedula())) {
      const f = await degradar(f0, { sigma: 1, ...DEGRADACION });
      expect(detectarPresencia(f, guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal)).presente, nombre).toBe(false);
    }
  });

  it("OFF-25 Cédulas degradadas a nivel de celular real: score 70 y motivo null; sin presencia, desenfocado", async () => {
    for (const [nombre, f] of Object.entries(cedulas)) {
      const sin = await analizar(f, false);
      expect(varianza(sin), nombre).toBeGreaterThanOrEqual(LAPLACIANO_MINIMO_GUIADO);
      expect(varianza(sin), nombre).toBeLessThan(152);
      expect(sin.resultado.motivo, nombre).toBe("desenfocado");
      expect(sin.resultado.score, nombre).toBeLessThan(70);
      const con = await analizar(f, true);
      expect([con.resultado.score, con.resultado.motivo], nombre).toStrictEqual([70, null]);
    }
  });

  it("OFF-25 Escenas sin cédula siguen sin disparar (nítidas y con sigma 1)", async () => {
    for (const [nombre, f0] of Object.entries(await sinCedula())) {
      for (const f of [f0, await degradar(f0, { sigma: 1, ...DEGRADACION })]) {
        const r = await analizar(f, true);
        expect(r.resultado.score, nombre).toBeLessThan(70);
        if (varianza(r) >= LAPLACIANO_MINIMO_GUIADO) expect(r.resultado.motivo, nombre).not.toBe("desenfocado");
      }
    }
  });

  it("OFF-25 Desenfoque extremo: motivo desenfocado", async () => {
    const r = await analizar(await degradar(tarjetaEnGuia(digital), { sigma: 3.5, ...DEGRADACION }), true);
    expect(varianza(r)).toBeLessThan(LAPLACIANO_MINIMO_GUIADO);
    expect(r.resultado.score).toBeLessThan(70);
    expect(r.resultado.motivo).toBe("desenfocado");
  });

  it("OFF-25 evaluarConPresencia: solo la nitidez por debajo del umbral activa la guía; otra limitación no", () => {
    const base = (varianzaL: number, otros: number, score: number, motivo: ResultadoCalidad["motivo"]): ResultadoCalidad => ({
      score,
      motivo,
      metricas: {
        nitidez: { varianza: varianzaL, subscore: score },
        reflejo: { fraccionSaturada: 0, componenteMayor: 0, subscore: otros },
        exposicion: { media: 120, fraccionOscura: 0, subscoreOscuro: 100, subscoreSobreexpuesto: 100 },
        tamano: null,
      },
    });
    let llamadas = 0;
    const si = () => (llamadas++, true);
    expect(evaluarConPresencia(base(30, 100, 10, "desenfocado"), si, 70)).toMatchObject({ score: 70, motivo: null });
    expect(evaluarConPresencia(base(30, 100, 10, "desenfocado"), () => false, 70)).toMatchObject({ score: 10, motivo: "acerca" });
    expect(evaluarConPresencia(base(LAPLACIANO_MINIMO_GUIADO - 1, 100, 0, "desenfocado"), si, 70)).toMatchObject({ motivo: "desenfocado" });
    expect(evaluarConPresencia(base(LAPLACIANO_MINIMO_GUIADO, 100, 0, "desenfocado"), si, 70)).toMatchObject({ score: 70, motivo: null });
    const reflejo = base(30, 40, 10, "desenfocado");
    expect(evaluarConPresencia(reflejo, si, 70)).toBe(reflejo);
    const nitido = base(500, 100, 90, null);
    expect(evaluarConPresencia(nitido, si, 70)).toBe(nitido);
    expect(evaluarConPresencia(nitido, () => false, 70)).toStrictEqual({ ...nitido, score: 69, motivo: "acerca" });
    expect(llamadas).toBe(3);
  });
});
