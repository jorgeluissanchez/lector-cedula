// LMI-05 en Chromium real (Vitest browser): lectura del ImageData de R con Tesseract.js 7.0.0 y mrz.traineddata
// servidos por el servidor de pruebas (sin CDN). R se dibuja aquí con canvas 2D y la fuente OCR-B de prueba siguiendo
// las convenciones de la spec lectura-mrz-imagen; datos de @lector-cedula/fixtures. Requiere `npm run modelos:mrz`.
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import { parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import urlCore from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import urlWorker from "tesseract.js/dist/worker.min.js?url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import urlFuente from "../../../../evals/sinteticos/fuentes/OCRB.otf?url";
import urlModelo from "../../../../models/tesseract/mrz.traineddata?url";
import { crearLectorMrz, type LectorMrz } from "../../src/index.js";

const REF = { fechaReferencia: "2026-10-06" };
const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });
let R: ImageData;
let lector: LectorMrz;

/** Reverso sintético R(L) (spec lectura-mrz-imagen, Convenciones). */
function reverso(lineas: readonly string[]): ImageData {
  const c = new OffscreenCanvas(1011, 638);
  const x = c.getContext("2d", { willReadFrequently: true });
  if (x === null) throw new Error("sin 2d");
  x.fillStyle = "#F2EFE6";
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#111111";
  x.font = "28px sans-serif";
  x.fillText("REPUBLICA DE COLOMBIA - DOCUMENTO SINTETICO", 40, 60);
  x.fillStyle = "#BBBBBB";
  x.fillRect(700, 120, 260, 260);
  x.fillStyle = "#111111";
  x.font = "36px 'OCRB-prueba'";
  lineas.forEach((l, i) => x.fillText(l, 40, 520 + 50 * i));
  return x.getImageData(0, 0, c.width, c.height);
}

beforeAll(async () => {
  const fuente = new FontFace("OCRB-prueba", `url(${urlFuente})`);
  await fuente.load();
  document.fonts.add(fuente);
  R = reverso(P.lineas);
  const base = new URL(urlModelo, location.href).href;
  lector = crearLectorMrz({
    rutaModelo: base.slice(0, base.lastIndexOf("/")),
    rutaWorker: new URL(urlWorker, location.href).href,
    rutaCore: new URL(urlCore, location.href).href,
  });
}, 60_000);

afterAll(async () => {
  await lector?.terminar();
});

describe("LMI-05 en navegador", { timeout: 120_000 }, () => {
  it("LMI-05 ImageData en navegador", async () => {
    const r = await lector.leer(R, REF);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.digitosValidos).toBe(4);
    expect(r.resultado).toStrictEqual(parsearMrzCedulaDigital([...P.lineasSinErrores], REF));
    expect(r.resultado.lineasCorregidas).toStrictEqual([...P.lineasSinErrores]);
  });

  it("LMI-05 Bytes PNG en navegador", async () => {
    const c = new OffscreenCanvas(R.width, R.height);
    c.getContext("2d")?.putImageData(R, 0, 0);
    const png = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
    expect(await lector.leer(png, REF)).toMatchObject({ ok: true, digitosValidos: 4 });
  });

  it("LMI-05 Sin rutas locales de worker y core no se usa la CDN: modelo-no-disponible", async () => {
    const sinRutas = crearLectorMrz({ rutaModelo: "/modelos" });
    expect(await sinRutas.leer(R, REF)).toStrictEqual({ ok: false, error: "modelo-no-disponible" });
    await sinRutas.terminar();
  });
});
