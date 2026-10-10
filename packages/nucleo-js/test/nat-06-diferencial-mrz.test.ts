// fixture-sintetico: escenas de tools/nativo/fixtures-mrz.mjs (PERSONA_BASE, NUIP 9999123456, y el pasaporte de OD-01).
// NAT-06 "Paridad de líneas" (sdk-nativo, tarea 1.5; parte TS de CT): el volcado del núcleo Kotlin con Tesseract nativo
// (native/android/nucleo/build/volcados/mrz.json, escrito por `KJ`) frente a packages/capture en Node con Tesseract.js y
// el mismo mrz.traineddata sobre las mismas escenas: mismas vistas (giro, método, caja y huella de la imagen que recibe
// el OCR) en cada llamada, mismo número de llamadas, mismo intento, mismas líneas y el mismo resultado interpretado.
// Sin volcado, sin escenas o sin modelo se omite; con CT_ESTRICTO=1 falla.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { enderezar } from "../../capture/src/mrz/enderezar.js";
import { crearWorkerTesseract, opcionesWorker } from "../../capture/src/mrz/entorno.js";
import { extraerLineasMrz, extraerLineasTd3 } from "../../capture/src/mrz/extraer.js";
import { interpretarLineasMrz } from "../../capture/src/mrz/interpretar.js";
import { crearLectorMrz, intentosMrz, intentosTd3, recortarYAmpliar, type WorkerOcr } from "../../capture/src/mrz/lector.js";

const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const FIXTURES = process.env["MRZ_FIXTURES"] ?? join(RAIZ, "native", "android", "build", "fixtures-mrz");
const VOLCADO = join(RAIZ, "native", "android", "nucleo", "build", "volcados", "mrz.json");
const MODELO = join(RAIZ, "models", "tesseract");
const ESTRICTO = process.env["CT_ESTRICTO"] === "1";
const hayDatos = existsSync(join(FIXTURES, "casos.json")) && existsSync(VOLCADO) && existsSync(join(MODELO, "mrz.traineddata"));

interface Caso {
  nombre: string;
  archivo: string;
  ancho: number;
  alto: number;
  formato: "td1" | "td3";
  lineas: string[];
}

interface FilaVolcado {
  nombre: string;
  lineas: string[] | null;
  intento: string | null;
  llamadas: number;
  vistas: { giro: number; metodo: string; caja: number[]; vista: number[] }[];
}

function fnv(d: Uint8Array | Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (const v of d) h = Math.imul(h ^ v, 0x01000193) >>> 0;
  return h;
}

describe("NAT-06 Paridad de líneas y vistas con packages/capture (CT)", { timeout: 600_000 }, () => {
  it.runIf(hayDatos || ESTRICTO)("NAT-06 Paridad de líneas: mismas vistas, llamadas, intento y líneas que la web en el 100 % de las escenas", async () => {
    expect(hayDatos, `faltan ${FIXTURES}/casos.json, ${VOLCADO} o el modelo (npm run modelos:mrz)`).toBe(true);
    const { fechaReferencia, casos } = JSON.parse(readFileSync(join(FIXTURES, "casos.json"), "utf8")) as { fechaReferencia: string; casos: Caso[] };
    const volcado = JSON.parse(readFileSync(VOLCADO, "utf8")) as { fechaReferencia: string; casos: FilaVolcado[] };
    expect(volcado.fechaReferencia).toBe(fechaReferencia);
    expect(volcado.casos.map((c) => c.nombre)).toStrictEqual(casos.map((c) => c.nombre));
    const textos: string[] = [];
    const lector = crearLectorMrz({
      rutaModelo: MODELO,
      crearWorker: async (idioma, oem, op) => {
        const w = await crearWorkerTesseract(idioma, oem, { ...op, ...(await opcionesWorker({ rutaModelo: MODELO })) });
        const grabador: WorkerOcr = {
          setParameters: (p) => w.setParameters(p),
          recognize: async (imagen) => {
            const r = await w.recognize(imagen);
            textos.push(r.data.text);
            return r;
          },
          terminate: () => w.terminate(),
        };
        return grabador;
      },
    });
    try {
      for (const [i, caso] of casos.entries()) {
        const nativo = volcado.casos[i] as FilaVolcado;
        const pixeles = { data: new Uint8ClampedArray(readFileSync(join(FIXTURES, caso.archivo))), width: caso.ancho, height: caso.alto };
        // Vistas: el plan web en las mismas llamadas que hizo el nativo.
        const plan = caso.formato === "td3" ? intentosTd3(pixeles) : intentosMrz(pixeles);
        const vistas = [];
        for (const { giro, imagen, candidato } of plan) {
          if (vistas.length >= nativo.llamadas) break;
          const v = enderezar(recortarYAmpliar(imagen, candidato.caja));
          const c = candidato.caja;
          vistas.push({ giro, metodo: candidato.metodo, caja: [c.x, c.y, c.ancho, c.alto], vista: [v.width, v.height, fnv(v.data)] });
        }
        expect(nativo.vistas, `${caso.nombre}: vistas`).toStrictEqual(vistas);
        // Líneas: la lectura web completa con Tesseract.js.
        textos.length = 0;
        const web = await lector.leer(pixeles, caso.formato === "td3" ? { fechaReferencia, formato: "td3" } : { fechaReferencia });
        expect(nativo.llamadas, `${caso.nombre}: llamadas al OCR`).toBe(textos.length);
        expect(web.ok, `${caso.nombre}: la web lee la escena`).toBe(true);
        if (!web.ok) continue;
        expect(nativo.intento, `${caso.nombre}: intento`).toBe(web.intento);
        expect(nativo.lineas, `${caso.nombre}: líneas`).not.toBeNull();
        expect(interpretarLineasMrz(nativo.lineas, caso.formato, fechaReferencia, web.intento), `${caso.nombre}: interpretación`).toStrictEqual(web);
        // Con un documento o 4 dígitos válidos la web se detiene en la vista que leyó: sus líneas son las del nativo.
        if ("documento" in web || web.digitosValidos === 4) {
          const ultimo = textos.at(-1);
          expect(nativo.lineas, `${caso.nombre}: líneas de la última vista`).toStrictEqual(caso.formato === "td3" ? extraerLineasTd3(ultimo) : extraerLineasMrz(ultimo));
        }
      }
    } finally {
      await lector.terminar();
    }
  });
});
