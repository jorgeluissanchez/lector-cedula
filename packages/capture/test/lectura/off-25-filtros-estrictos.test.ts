// OFF-25 Filtros de calidad estrictos con la presencia como condición adicional (pwa-lectura-offline, tarea 5.8) y
// OFF-22 con frames degradados. Cédulas sintéticas de PERSONA_BASE (semilla 1) degradadas como la cámara de un celular
// real: desenfoque gaussiano o de movimiento, ruido y JPEG de calidad 50. Mediciones (solo números) en
// docs/decisiones/2026-10-10-recalibracion-nitidez.md.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { detectarPresencia, evaluarConPresencia } from "../../src/calidad/presencia.js";
import { analizarFrame } from "../../src/calidad/score.js";
import type { FrameAnalisis, ResultadoCalidad } from "../../src/calidad/tipos.js";
import { UMBRALES_POR_DEFECTO } from "../../src/calidad/umbrales.js";
import { crearDetectorGuia, guiaEnAnalisis } from "../../src/flujo/guia.js";
import type { MensajeDelWorker } from "../../src/navegador/protocolo.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";
import { pixelesSinteticos } from "../pdf417/sintetica.js";
import { cara, degradar, girar90, hojaEnBlanco, type Imagen, pared, tarjetaEnGuia, tarjetaVerticalEnGuia, texto } from "./escenas-presencia.js";

const DEGRADACION = { calidadJpeg: 50, ruido: 4 } as const;
/** Varianza del Laplaciano en la que el score de nitidez vale 70 con los umbrales recalibrados (`rampa(27, 8, 35)`). */
const VARIANZA_LISTO = 27;
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
const suave = (f: FrameAnalisis, sigma: number) => degradar(f, { sigma, ...DEGRADACION });

/** Media de `l` píxeles a lo largo de (dx, dy) desde cada píxel, con borde replicado: desenfoque de movimiento. */
function movimiento(f: FrameAnalisis, l: number, dx: number, dy: number): FrameAnalisis {
  const p = new Uint8ClampedArray(f.pixeles.length);
  for (let y = 0; y < f.alto; y++) {
    for (let x = 0; x < f.ancho; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let i = 0; i < l; i++) {
          const xx = Math.min(f.ancho - 1, x + i * dx);
          const yy = Math.min(f.alto - 1, y + i * dy);
          s += f.pixeles[(yy * f.ancho + xx) * 4 + c] as number;
        }
        p[(y * f.ancho + x) * 4 + c] = Math.round(s / l);
      }
    }
  }
  return { ...f, pixeles: p };
}

/** Bloque de luminancia 255 en [x0..x1]x[y0..y1] (inclusivo) del frame de análisis. */
function reflejo(f: FrameAnalisis, x0: number, x1: number, y0: number, y1: number): FrameAnalisis {
  const p = new Uint8ClampedArray(f.pixeles);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.fill(255, (y * f.ancho + x) * 4, (y * f.ancho + x) * 4 + 3);
  return { ...f, pixeles: p };
}

/** Aplica `g` a cada canal RGB. */
function canales(f: FrameAnalisis, g: (v: number) => number): FrameAnalisis {
  const p = new Uint8ClampedArray(f.pixeles);
  for (let i = 0; i < p.length; i++) if (i % 4 !== 3) p[i] = g(p[i] as number);
  return { ...f, pixeles: p };
}

describe("OFF-25 Filtros de calidad estrictos", { timeout: 60_000 }, () => {
  it("OFF-22 Cédulas sintéticas degradadas y escenas degradadas: presencia solo en las cédulas", async () => {
    const cedulas = {
      amarilla: await degradar(tarjetaEnGuia(amarilla, 0.2), { sigma: 1, ...DEGRADACION }),
      digital: await suave(tarjetaEnGuia(digital), 1.5),
      vertical: await suave(tarjetaVerticalEnGuia(girar90(digital)), 1),
    };
    for (const [nombre, f] of Object.entries(cedulas)) {
      expect(detectarPresencia(f, guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal)).presente, nombre).toBe(true);
    }
    for (const [nombre, f0] of Object.entries({ cara: cara(), pared: pared(), hoja: hojaEnBlanco(), texto: texto() })) {
      const f = await suave(f0, 1);
      expect(detectarPresencia(f, guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal)).presente, nombre).toBe(false);
    }
  });

  it("OFF-25 Cédula suave como la de un celular real dispara (con y sin presencia)", async () => {
    const escenas = {
      "digital sigma 1,5": await suave(tarjetaEnGuia(digital), 1.5),
      "digital girada sigma 1": await suave(tarjetaVerticalEnGuia(girar90(digital)), 1),
      "amarilla sigma 1,5": await suave(tarjetaEnGuia(amarilla), 1.5),
      "amarilla 20 % sigma 0,75": await suave(tarjetaEnGuia(amarilla, 0.2), 0.75),
    };
    for (const [nombre, f] of Object.entries(escenas)) {
      for (const presencia of [false, true]) {
        const r = await analizar(f, presencia);
        expect(varianza(r), nombre).toBeGreaterThanOrEqual(VARIANZA_LISTO);
        expect(varianza(r), nombre).toBeLessThan(152);
        expect(r.resultado.score, `${nombre} presencia ${presencia}`).toBeGreaterThanOrEqual(70);
        expect(r.resultado.motivo, `${nombre} presencia ${presencia}`).toBeNull();
      }
    }
  });

  it("OFF-25 Cédula más suave que el umbral no dispara aunque esté en la guía", async () => {
    const escenas = {
      "amarilla 20 % sigma 1": await suave(tarjetaEnGuia(amarilla, 0.2), 1),
      "digital sigma 2": await suave(tarjetaEnGuia(digital), 2),
      "digital sigma 3,5": await suave(tarjetaEnGuia(digital), 3.5),
    };
    for (const [nombre, f] of Object.entries(escenas)) {
      const r = await analizar(f, true);
      expect(varianza(r), nombre).toBeLessThan(VARIANZA_LISTO);
      expect([r.resultado.score < 70, r.resultado.motivo], nombre).toStrictEqual([true, "desenfocado"]);
    }
  });

  it("OFF-25 Escena movida: desenfoque de movimiento diagonal de 9 px y horizontal de 15 px", async () => {
    const escenas = {
      "diagonal 9 px": await suave(movimiento(tarjetaEnGuia(digital), 9, 1, 1), 1),
      "horizontal 15 px": await suave(movimiento(tarjetaEnGuia(digital), 15, 1, 0), 1),
    };
    for (const [nombre, f] of Object.entries(escenas)) {
      const r = await analizar(f, true);
      expect([r.resultado.score < 70, r.resultado.motivo], nombre).toStrictEqual([true, "desenfocado"]);
    }
  });

  it("OFF-25 Reflejo fuerte sobre la MRZ", async () => {
    for (const [nombre, base] of [["nítida", tarjetaEnGuia(digital)], ["sigma 1,5", await suave(tarjetaEnGuia(digital), 1.5)]] as const) {
      const r = await analizar(reflejo(base, 70, 570, 262, 336), true);
      expect([r.resultado.score < 70, r.resultado.motivo], nombre).toStrictEqual([true, "reflejo"]);
    }
  });

  it("OFF-25 Escena oscura y escena sobreexpuesta", async () => {
    for (const [nombre, base] of [["digital", tarjetaEnGuia(digital)], ["amarilla", tarjetaEnGuia(amarilla)]] as const) {
      const oscura = await analizar(canales(base, (v) => Math.round(v * 0.1)), true);
      expect([oscura.resultado.score < 70, oscura.resultado.motivo], nombre).toStrictEqual([true, "oscuro"]);
      const clara = await analizar(canales(base, (v) => 245 + Math.round(v * 0.04)), true);
      expect([clara.resultado.score < 70, clara.resultado.motivo], nombre).toStrictEqual([true, "sobreexpuesto"]);
    }
  });

  it("OFF-25 Escenas sin cédula siguen sin disparar (nítidas y con sigma 1)", async () => {
    let bloqueadasPorPresencia = 0;
    for (const [nombre, f0] of Object.entries({ cara: cara(), pared: pared(), hoja: hojaEnBlanco(), texto: texto() })) {
      for (const f of [f0, await suave(f0, 1)]) {
        const r = await analizar(f, true);
        expect(r.resultado.score, nombre).toBeLessThan(70);
        const cal07 = analizarFrame(f, { cuadrilatero: guiaEnAnalisis(f.ancho, f.alto, f.anchoOriginal, f.altoOriginal), confianza: null, fuente: "guia" }, UMBRALES_POR_DEFECTO);
        if (!cal07.ok) throw new Error(cal07.codigo);
        if (cal07.resultado.score >= 70) {
          bloqueadasPorPresencia++;
          expect([r.resultado.score, r.resultado.motivo], nombre).toStrictEqual([69, "acerca"]);
        } else {
          expect(r.resultado, nombre).toStrictEqual(cal07.resultado);
        }
      }
    }
    // La cara, la pared, la hoja y el texto nítidos (y el texto con sigma 1) superan el umbral de CAL-07: los frena OFF-22.
    expect(bloqueadasPorPresencia).toBe(5);
  });

  it("OFF-25 La presencia no se evalúa por debajo del umbral", () => {
    const base = (score: number, motivo: ResultadoCalidad["motivo"]): ResultadoCalidad => ({
      score,
      motivo,
      metricas: {
        nitidez: { varianza: 26, subscore: score },
        reflejo: { fraccionSaturada: 0, componenteMayor: 0, subscore: motivo === "reflejo" ? score : 100 },
        exposicion: { media: 120, fraccionOscura: 0, subscoreOscuro: 100, subscoreSobreexpuesto: 100 },
        tamano: null,
      },
    });
    let llamadas = 0;
    const sin = () => (llamadas++, false);
    const desenfocado = base(69, "desenfocado");
    expect(evaluarConPresencia(desenfocado, sin, 70)).toBe(desenfocado);
    const conReflejo = base(10, "reflejo");
    expect(evaluarConPresencia(conReflejo, sin, 70)).toBe(conReflejo);
    expect(llamadas).toBe(0);
    const nitido = base(90, null);
    expect(evaluarConPresencia(nitido, sin, 70)).toStrictEqual({ ...nitido, score: 69, motivo: "acerca" });
    expect(llamadas).toBe(1);
    expect(evaluarConPresencia(nitido, () => true, 70)).toBe(nitido);
    expect(evaluarConPresencia(base(70, null), () => true, 70)).toStrictEqual(base(70, null));
  });
});
