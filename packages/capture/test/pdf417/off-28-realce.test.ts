// OFF-28 (b) PDF417 en frames de vídeo (pwa-lectura-offline): recorte de la banda, ampliación bilineal, contraste y
// enfoque antes de zxing. Frames sintéticos de 1920x1080 degradados como un vídeo real (módulos de 2 px, desenfoque,
// JPEG). Datos SINTÉTICOS (PERSONA_BASE, semilla 1); nada se guarda.
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { crearDecodificador, type DecodificadorPdf417, type OpcionesLector } from "../../src/pdf417/decodificar.js";
import { aGris, cajaBanda } from "../../src/pdf417/localizar.js";
import type { Pixeles } from "../../src/pdf417/pixeles.js";
import { ampliar, realzar } from "../../src/pdf417/realce.js";
import { lectorReal } from "./sintetica.js";
import { frameVideoAmarilla } from "./sintetica-video.js";

const F = generarPdf417(PERSONA_BASE, { semilla: 1 });
let lector: DecodificadorPdf417;

beforeAll(async () => {
  lector = (await lectorReal()) as unknown as DecodificadorPdf417;
}, 60_000);

describe("OFF-28 Realce del PDF417 en frames de vídeo", { timeout: 120_000 }, () => {
  it("OFF-28 Frame de vídeo degradado: sin realce no se lee, con realce sí", async () => {
    for (const [sigma, calidadJpeg] of [[1.3, 60], [1.2, 45]] as const) {
      const p = await frameVideoAmarilla(F.bytes, { modulo: 2, sigma, calidadJpeg, giro: 1 });
      const sin = await crearDecodificador({ readBarcodes: lector })(p);
      expect(sin, `sigma ${sigma}`).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
      const con = await crearDecodificador({ readBarcodes: lector, realce: true })(p);
      expect(con.ok, `sigma ${sigma}`).toBe(true);
      if (con.ok) {
        expect(con.bytes).toStrictEqual(F.bytes);
        expect(con.intento).toMatch(/^realce-x[123](-global)?$/u);
      }
    }
  });

  it("OFF-28 Sin lecturas falsas: barras aleatorias y amarilla demasiado degradada", async () => {
    const dec = crearDecodificador({ readBarcodes: lector, realce: true });
    const falsas = await frameVideoAmarilla(F.bytes, { modulo: 2, sigma: 1, calidadJpeg: 60, giro: 1, barrasFalsas: true });
    expect(await dec(falsas)).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
    const borrosa = await frameVideoAmarilla(F.bytes, { modulo: 2, sigma: 2.5, calidadJpeg: 60, giro: 1 });
    expect(await dec(borrosa)).toStrictEqual({ ok: false, error: "pdf417-no-encontrado" });
  });

  it("OFF-28 Orden con realce: llamadas 12 a 16 y después la rejilla", async () => {
    const p = await frameVideoAmarilla(F.bytes, { modulo: 2, sigma: 0, calidadJpeg: null });
    const caja = cajaBanda(aGris(p));
    expect(caja).not.toBeNull();
    const llamadas: { imagen: Pixeles; opciones: OpcionesLector }[] = [];
    const nunca: DecodificadorPdf417 = async (imagen, opciones) => (llamadas.push({ imagen, opciones }), []);
    const sinRealce: typeof llamadas = [];
    await crearDecodificador({ readBarcodes: async (imagen, opciones) => (sinRealce.push({ imagen, opciones }), []), limiteMs: 1e9 })(p);
    await crearDecodificador({ readBarcodes: nunca, realce: true, limiteMs: 1e9 })(p);
    expect(llamadas).toHaveLength(sinRealce.length + 5);
    const realce = llamadas.slice(11, 16);
    expect(realce.map((l) => l.opciones.binarizer)).toStrictEqual(["LocalAverage", "GlobalHistogram", "LocalAverage", "GlobalHistogram", "LocalAverage"]);
    expect(realce.map((l) => l.imagen.width)).toStrictEqual([2, 2, 3, 3, 1].map((k) => Math.round((caja?.w ?? 0) * k)));
    for (const l of realce) expect(l.opciones).toMatchObject({ formats: ["PDF417"], tryHarder: true, tryDownscale: true });
    // Las primeras 11 y la rejilla son las mismas que sin realce (LPI-11 no cambia).
    expect(llamadas.slice(0, 11).map((l) => [l.imagen.width, l.opciones.binarizer])).toStrictEqual(sinRealce.slice(0, 11).map((l) => [l.imagen.width, l.opciones.binarizer]));
    expect(llamadas.slice(16).map((l) => l.imagen.width)).toStrictEqual(sinRealce.slice(11).map((l) => l.imagen.width));
  });

  it("OFF-28 Mitad inferior si no hay banda", async () => {
    const blanco = { data: new Uint8ClampedArray(64 * 40 * 4).fill(255), width: 64, height: 40 };
    const llamadas: Pixeles[] = [];
    await crearDecodificador({ readBarcodes: async (imagen) => (llamadas.push(imagen), []), realce: true, localizar: true })(blanco);
    const anchos = llamadas.map((i) => `${i.width}x${i.height}`);
    expect(anchos).toContain("128x40");
    expect(anchos).toContain("192x60");
  });
});

describe("OFF-28 Funciones de realce", () => {
  it("ampliar: tamaño y valores interpolados entre los vecinos", () => {
    const p = { data: new Uint8ClampedArray([0, 0, 0, 255, 200, 200, 200, 255]), width: 2, height: 1 };
    const a = ampliar(p, 2);
    expect([a.width, a.height]).toStrictEqual([4, 2]);
    const v = [0, 1, 2, 3].map((i) => a.data[i * 4] as number);
    expect(v[0]).toBe(0);
    expect(v[3]).toBe(200);
    expect(v[1]).toBeGreaterThan(0);
    expect(v[1]).toBeLessThan(v[2] as number);
    expect(a.data[3]).toBe(255);
  });

  it("realzar: estira el contraste al rango completo y enfoca el borde", () => {
    const w = 100;
    const data = new Uint8ClampedArray(w * 4);
    for (let x = 0; x < w; x++) {
      data.fill(x < 50 ? 100 : 140, x * 4, x * 4 + 3);
      data[x * 4 + 3] = 255;
    }
    const r = realzar({ data, width: w, height: 1 }, 2, 1);
    expect(r.data[0]).toBe(0);
    expect(r.data[(w - 1) * 4]).toBe(255);
    // Sobreoscilación junto al borde: el lado oscuro se satura a 0 y el claro a 255.
    expect(r.data[49 * 4]).toBe(0);
    expect(r.data[50 * 4]).toBe(255);
  });
});
