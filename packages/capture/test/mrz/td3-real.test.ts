// Cambio otros-documentos, OD-21 (tarea 2.2) con Tesseract.js 7.0.0 y mrz.traineddata REALES: el pasaporte sintético
// de OD-01 (página de datos 1250x880 sobre madera) y sus giros de 90, 180 y 270 grados dan la misma lectura (relación
// metamórfica), cada una con el sufijo de giro de su vista. Requiere `npm run modelos:mrz`. Todo en memoria.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { leerDocumento } from "../../src/lectura/leer.js";
import { crearLectorMrz, type LectorMrz } from "../../src/mrz/lector.js";
import { girar, type PixelesRgba } from "../../src/mrz/localizar.js";
import { PASAPORTE_COL } from "../../../parsers/test/ayudas/generador-mrz-icao.js";
import { madera, pegarEscalada } from "./escena-madera.js";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const MODELO = join(RAIZ, "models", "tesseract");
const REF = "2026-10-08";

let foto: PixelesRgba;
let lector: LectorMrz;

beforeAll(async () => {
  if (!existsSync(join(MODELO, "mrz.traineddata"))) throw new Error("falta el modelo: ejecuta npm run modelos:mrz");
  const render = await crearRenderizador();
  try {
    const pagina = PNG.sync.read(Buffer.from((await render.render(PASAPORTE_COL)).bytes));
    expect([pagina.width, pagina.height]).toStrictEqual([1250, 880]);
    const fondo = madera(1450, 1080);
    pegarEscalada(fondo, pagina, 1250);
    foto = { width: fondo.width, height: fondo.height, data: new Uint8ClampedArray(fondo.data) };
  } finally {
    await render.cerrar();
  }
  lector = crearLectorMrz({ rutaModelo: MODELO });
}, 60_000);

afterAll(async () => {
  await lector?.terminar();
});

describe("OD-21 Pasaporte en las cuatro orientaciones (OCR real)", { timeout: 180_000 }, () => {
  const casos = [
    [0, ""],
    [90, "@270"],
    [180, "@180"],
    [270, "@90"],
  ] as const;
  for (const [giro, sufijo] of casos) {
    it(`OD-21 Pasaporte girado ${giro}: pasaporte AZ1234567 con intento${sufijo === "" ? " sin sufijo" : ` ${sufijo}`}`, async () => {
      const imagen = giro === 0 ? foto : girar(foto, giro);
      const r = await leerDocumento(
        imagen,
        { decodificar: async () => ({ ok: false, error: "pdf417-no-encontrado" }), lectorMrz: lector, parsearPdf417: parsearPdf417Amarilla, buscarDivipol },
        { fechaReferencia: REF, pista: "mrz-td3", respaldo: false, enmascarar: false },
      );
      expect(r).toMatchObject({ ok: true, tipoDocumento: "pasaporte", fuente: "mrz-td3", campos: { numeroDocumento: "AZ1234567", paisEmisor: "COL" } });
      if (!r.ok) return;
      expect(r.intento.endsWith(sufijo)).toBe(true);
      expect(r.intento.includes("@")).toBe(sufijo !== "");
    });
  }
});
