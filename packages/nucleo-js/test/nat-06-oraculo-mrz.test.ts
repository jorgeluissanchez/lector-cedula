// fixture-sintetico: tarjetas generadas con bandas de "texto" de barras (sin caracteres ni datos de personas).
// NAT-06 (sdk-nativo, tarea 1.5): el oráculo MRZ que las pruebas Kotlin evalúan en QuickJS (`dist/oraculo-mrz.js`) da,
// en QuickJS, lo mismo que `packages/capture/src/mrz` en Node: si el empaquetado sin OCR cambiara el plan, el
// diferencial Kotlin compararía contra otra cosa.
import variante from "@jitl/quickjs-wasmfile-release-sync";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newQuickJSWASMModuleFromVariant, type QuickJSContext } from "quickjs-emscripten-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enderezar } from "../../capture/src/mrz/enderezar.js";
import { intentosMrz, intentosTd3, recortarYAmpliar } from "../../capture/src/mrz/lector.js";
import type { PixelesRgba } from "../../capture/src/mrz/localizar.js";
// @ts-expect-error: script .mjs sin tipos.
import { construirOraculoMrz } from "../scripts/construir.mjs";

let qjs: QuickJSContext;
let codigo = "";

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "oraculo-mrz-prueba-"));
  try {
    const salida = join(dir, "oraculo-mrz.js");
    await construirOraculoMrz({ salida });
    codigo = await readFile(salida, "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  qjs = (await newQuickJSWASMModuleFromVariant(variante)).newContext();
  qjs.unwrapResult(qjs.evalCode(codigo)).dispose();
}, 60_000);

afterAll(() => qjs?.dispose());

function enQuickJs(expr: string): unknown {
  const h = qjs.unwrapResult(qjs.evalCode(expr));
  try {
    return JSON.parse(qjs.getString(h));
  } finally {
    h.dispose();
  }
}

/** Tarjeta clara de `w` x `h` con `filas` líneas de barras cortas (forma de MRZ) en la parte baja. */
function tarjeta(w: number, h: number, filas: number, porLinea: number): PixelesRgba {
  const data = new Uint8ClampedArray(w * h * 4).fill(220);
  const alto = Math.max(3, Math.round(h / 16));
  const y0 = h - Math.round(h / 10) - filas * Math.round(alto * 1.8);
  for (let f = 0; f < filas; f++) {
    for (let k = 0; k < porLinea; k++) {
      const x0 = Math.round(w * 0.05 + (k * w * 0.9) / porLinea);
      const ancho = Math.max(1, Math.round((w * 0.9) / porLinea / 2));
      for (let y = y0 + f * Math.round(alto * 1.8); y < y0 + f * Math.round(alto * 1.8) + alto; y++) {
        for (let x = x0; x < x0 + ancho; x++) for (let c = 0; c < 3; c++) data[(y * w + x) * 4 + c] = 30;
      }
    }
  }
  return { data, width: w, height: h };
}

const b64 = (p: PixelesRgba): string => Buffer.from(p.data).toString("base64");

function fnv(d: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (const v of d) h = Math.imul(h ^ v, 0x01000193) >>> 0;
  return h;
}

describe("NAT-06 Oráculo MRZ en QuickJS", { timeout: 60_000 }, () => {
  it("NAT-06 El oráculo no arrastra Tesseract.js, PNG ni import dinámico", () => {
    for (const prohibido of [/\bimport\s*\(/u, /tesseract\.js/u, /pngjs/u, /\brequire\s*\(/u]) expect(codigo).not.toMatch(prohibido);
  });

  for (const [formato, filas, porLinea] of [["td1", 3, 30], ["td3", 2, 44]] as const) {
    it(`NAT-06 Plan de vistas ${formato} y huellas de las vistas iguales en QuickJS y en Node`, () => {
      const p = tarjeta(180, 114, filas, porLinea);
      const vistas = 4;
      const q = enQuickJs(`OraculoMrz.plan('${b64(p)}', ${p.width}, ${p.height}, '${formato}', ${vistas})`) as { giro: number; metodo: string; caja: number[]; vista?: number[] }[];
      const n = [...(formato === "td3" ? intentosTd3(p) : intentosMrz(p))].map(({ giro, imagen, candidato }, i) => {
        const c = candidato.caja;
        const e: { giro: number; metodo: string; caja: number[]; vista?: number[] } = { giro, metodo: candidato.metodo, caja: [c.x, c.y, c.ancho, c.alto] };
        if (i < vistas) {
          const v = enderezar(recortarYAmpliar(imagen, c));
          e.vista = [v.width, v.height, fnv(v.data)];
        }
        return e;
      });
      expect(q).toStrictEqual(n);
      // El plan recorre las cuatro orientaciones (LMI-12c) y tiene ventanas de LMI-11.
      expect(new Set(q.map((e) => e.giro))).toStrictEqual(new Set([0, 90, 270, 180]));
      expect(q.some((e) => e.metodo === "franja")).toBe(true);
    });
  }

  it("NAT-06 La huella FNV-1a del oráculo es la de referencia", () => {
    expect(enQuickJs(`OraculoMrz.huella('${Buffer.from("abc").toString("base64")}')`)).toBe(0x1a47e90b);
  });
});
