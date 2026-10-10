// MOT-05 (D3 de design.md): dimensiones leídas de la cabecera PNG (IHDR), JPEG (SOF) y WebP (VP8, VP8L, VP8X) antes de
// decodificar. Los generadores construyen cabeceras válidas por construcción (oráculo independiente: los bytes se
// escriben con la especificación de cada formato, no con el lector).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { leerCabecera } from "../src/cabeceras.js";

function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function png(ancho: number, alto: number, resto = 0): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii("IHDR"), ...be32(ancho), ...be32(alto), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array<number>(resto).fill(0)]);
}

function jpeg(ancho: number, alto: number, sof = 0xc0, extra: number[][] = []): Uint8Array {
  const segmentos = extra.flatMap((s) => [0xff, s[0] ?? 0xe0, 0, s.length + 1, ...s.slice(1)]);
  return new Uint8Array([0xff, 0xd8, ...segmentos, 0xff, sof, 0x00, 0x11, 8, alto >> 8, alto & 0xff, ancho >> 8, ancho & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}

function riff(chunk: string, datos: number[]): Uint8Array {
  const tam = 4 + 8 + datos.length;
  return new Uint8Array([...ascii("RIFF"), tam & 0xff, (tam >> 8) & 0xff, 0, 0, ...ascii("WEBP"), ...ascii(chunk), datos.length & 0xff, datos.length >> 8, 0, 0, ...datos]);
}

function webpVp8(ancho: number, alto: number): Uint8Array {
  return riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ancho & 0xff, (ancho >> 8) & 0x3f, alto & 0xff, (alto >> 8) & 0x3f, 0, 0]);
}

function webpVp8l(ancho: number, alto: number): Uint8Array {
  const w = ancho - 1;
  const h = alto - 1;
  return riff("VP8L", [0x2f, w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x3) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f, 0, 0, 0]);
}

function webpVp8x(ancho: number, alto: number): Uint8Array {
  const w = ancho - 1;
  const h = alto - 1;
  return riff("VP8X", [0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]);
}

describe("MOT-05 lector de cabeceras", { timeout: 60_000 }, () => {
  it.each([
    ["png", png(1920, 1080), { formato: "png", ancho: 1920, alto: 1080 }],
    ["jpeg SOF0", jpeg(1280, 720), { formato: "jpeg", ancho: 1280, alto: 720 }],
    ["jpeg SOF2 tras APP0 y relleno", jpeg(640, 480, 0xc2, [[0xe0, 1, 2, 3]]), { formato: "jpeg", ancho: 640, alto: 480 }],
    ["webp VP8", webpVp8(800, 600), { formato: "webp", ancho: 800, alto: 600 }],
    ["webp VP8L", webpVp8l(16383, 1), { formato: "webp", ancho: 16383, alto: 1 }],
    ["webp VP8X", webpVp8x(20000, 20000), { formato: "webp", ancho: 20000, alto: 20000 }],
  ])("MOT-05 %s", (_n, bytes, esperado) => {
    expect(leerCabecera(bytes)).toStrictEqual(esperado);
  });

  it("MOT-05 bomba: PNG de 40 KB que declara 20 000 x 20 000", () => {
    const bomba = png(20_000, 20_000, 40_000);
    expect(leerCabecera(bomba)).toStrictEqual({ formato: "png", ancho: 20_000, alto: 20_000 });
  });

  it.each([
    ["PDF", new Uint8Array([0x25, 0x50, 0x44, 0x46])],
    ["vacío", new Uint8Array(0)],
    ["PNG truncado", png(10, 10).slice(0, 20)],
    ["PNG sin IHDR", (() => { const b = png(10, 10); b[12] = 0x41; return b; })()],
    ["PNG de 0 x 5", png(0, 5)],
    ["JPEG sin SOF", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ["JPEG truncado", jpeg(10, 10).slice(0, 8)],
    ["JPEG con segmento de longitud 0", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xc0])],
    ["JPEG de alto 0", jpeg(10, 0)],
    ["RIFF que no es WEBP", new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...ascii("fmt "), 0, 0, 0, 0])],
    ["WebP con chunk desconocido", riff("ALPH", new Array<number>(12).fill(0))],
    ["WebP VP8 sin firma", (() => { const b = webpVp8(10, 10); b[23] = 0; return b; })()],
    ["WebP VP8L sin firma", (() => { const b = webpVp8l(10, 10); b[20] = 0; return b; })()],
    ["WebP truncado", webpVp8(10, 10).slice(0, 26)],
  ])("MOT-05 sin cabecera reconocible: %s", (_n, bytes) => {
    expect(leerCabecera(bytes)).toBeNull();
  });

  it("MOT-05 Propiedad: dimensiones leídas = dimensiones generadas (PNG, JPEG, WebP)", () => {
    const dim = (max: number) => fc.integer({ min: 1, max });
    const caso = fc.oneof(
      fc.tuple(fc.constant("png" as const), dim(2 ** 31 - 1), dim(2 ** 31 - 1)).map(([f, w, h]) => ({ f, w, h, b: png(w, h) })),
      fc.tuple(fc.constant("jpeg" as const), dim(65_535), dim(65_535), fc.constantFrom(0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf)).map(([f, w, h, s]) => ({ f, w, h, b: jpeg(w, h, s) })),
      fc.tuple(fc.constant("webp" as const), dim(16_383), dim(16_383)).map(([f, w, h]) => ({ f, w, h, b: webpVp8(w, h) })),
      fc.tuple(fc.constant("webp" as const), dim(16_384), dim(16_384)).map(([f, w, h]) => ({ f, w, h, b: webpVp8l(w, h) })),
      fc.tuple(fc.constant("webp" as const), dim(2 ** 24), dim(2 ** 24)).map(([f, w, h]) => ({ f, w, h, b: webpVp8x(w, h) })),
    );
    fc.assert(
      fc.property(caso, ({ f, w, h, b }) => {
        expect(leerCabecera(b)).toStrictEqual({ formato: f, ancho: w, alto: h });
      }),
      { numRuns: 1000 },
    );
  });

  it("MOT-05 Fuzz: bytes arbitrarios nunca hacen lanzar", () => {
    const prefijo = fc.constantFrom([], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0xff, 0xd8], [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]);
    fc.assert(
      fc.property(prefijo, fc.uint8Array({ maxLength: 4096 }), (p, resto) => {
        const r = leerCabecera(new Uint8Array([...p, ...resto]));
        if (r !== null) expect(r.ancho > 0 && r.alto > 0).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});
