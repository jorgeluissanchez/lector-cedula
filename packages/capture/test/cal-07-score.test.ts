import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analizarFrame } from "../src/calidad/score.js";
import type { Cuadrilatero, DeteccionDocumento, ResultadoAnalisis } from "../src/calidad/tipos.js";
import { crearConfiguracionUmbrales, UMBRALES_POR_DEFECTO, type Umbrales } from "../src/calidad/umbrales.js";
import { comoFrame, completo, desenfocar, gris, GUIA_640, prng, rect, tablero, type Escena } from "./escenas.js";

const modelo = (cuadrilatero: Cuadrilatero | null): DeteccionDocumento => ({ cuadrilatero, confianza: 0.9, fuente: "modelo" });
const guia = (cuadrilatero: Cuadrilatero): DeteccionDocumento => ({ cuadrilatero, confianza: null, fuente: "guia" });

function analizar(e: Escena, deteccion: DeteccionDocumento = modelo(completo(e.ancho, e.alto)), u: Umbrales = UMBRALES_POR_DEFECTO) {
  const r = analizarFrame(comoFrame(e), deteccion, u);
  if (!r.ok) throw new Error(`análisis con error ${r.codigo}`);
  return r.resultado;
}

describe("CAL-07 Score y motivo", { timeout: 60_000 }, () => {
  it("CAL-07 Resultado completo", () => {
    expect(analizar(gris(64, 64, 128), guia(completo(64, 64)))).toStrictEqual({
      score: 0,
      motivo: "desenfocado",
      metricas: {
        nitidez: { varianza: 0, subscore: 0 },
        reflejo: { fraccionSaturada: 0, componenteMayor: 0, subscore: 100 },
        exposicion: { media: 128, fraccionOscura: 0, subscoreOscuro: 100, subscoreSobreexpuesto: 100 },
        tamano: null,
      },
    });
  });

  it("CAL-07 Frame bueno", () => {
    const r = analizar(tablero(64, 64, 60, 190));
    expect([r.score, r.motivo]).toStrictEqual([100, null]);
    expect(r.metricas?.tamano).toStrictEqual({ ratio: 1, subscore: 100 });
  });

  it("CAL-07 Empate entre motivos", () => {
    const r = analizar(tablero(64, 64, 0, 255));
    expect([r.metricas?.exposicion.subscoreOscuro, r.metricas?.reflejo.subscore]).toStrictEqual([0, 0]);
    expect([r.score, r.motivo]).toStrictEqual([0, "oscuro"]);
  });

  it("CAL-07 Empates: el orden es acerca, oscuro, sobreexpuesto, reflejo, desenfocado", () => {
    // Gris 255 lejano: acerca 0, sobreexpuesto 0, reflejo 0, desenfocado 0 -> acerca.
    expect(analizar(gris(64, 64, 255), modelo(rect(0, 0, 16, 16))).motivo).toBe("acerca");
    // Gris 255 completo: sobreexpuesto 0, reflejo 0, desenfocado 0 -> sobreexpuesto.
    expect(analizar(gris(64, 64, 255)).motivo).toBe("sobreexpuesto");
    // Tablero 200/255: reflejo 0 y nitidez 100; media 227,5 -> sobreexpuesto 31: el mínimo manda sobre el orden.
    const r = analizar(tablero(64, 64, 200, 255));
    expect([r.score, r.motivo]).toStrictEqual([0, "reflejo"]);
    // Gris 0 lejano: acerca 0 y oscuro 0 -> acerca.
    expect(analizar(gris(64, 64, 0), modelo(rect(0, 0, 16, 16))).motivo).toBe("acerca");
  });

  it("CAL-07 Documento lejano y documento suficiente", () => {
    const lejano = analizar(tablero(64, 64, 60, 190), modelo(rect(0, 0, 16, 16)));
    const suficiente = analizar(tablero(64, 64, 60, 190), modelo(rect(0, 0, 32, 32)));
    expect([lejano.score, lejano.motivo, suficiente.score, suficiente.motivo]).toStrictEqual([0, "acerca", 75, null]);
  });

  it("CAL-08 Sustitución parcial con efecto", () => {
    const config = crearConfiguracionUmbrales();
    expect(config.configurar({ umbralListo: 80 })).toStrictEqual({ ok: true });
    expect({ ...config.umbrales }).toStrictEqual({ ...UMBRALES_POR_DEFECTO, umbralListo: 80 });
    const r = analizar(tablero(64, 64, 60, 190), modelo(rect(0, 0, 32, 32)), config.umbrales);
    expect([r.score, r.motivo]).toStrictEqual([75, "acerca"]);
  });

  it("CAL-07 Score igual a umbralListo no lleva motivo", () => {
    const r = analizar(tablero(64, 64, 60, 190), modelo(rect(0, 0, 32, 32)), { ...UMBRALES_POR_DEFECTO, umbralListo: 75 });
    expect([r.score, r.motivo]).toStrictEqual([75, null]);
  });

  it("CAL-07 Desenfoque fuerte rechaza el frame", () => {
    for (const veces of [2, 3]) {
      const r = analizar(desenfocar(tablero(128, 128, 60, 190), veces));
      expect(r.score).toBeLessThan(70);
      expect(r.motivo).toBe("desenfocado");
    }
  });

  it("CAL-06 Guía como cuadrilátero", () => {
    const r = analizar(tablero(640, 360, 60, 190), guia(GUIA_640));
    expect(r.metricas?.tamano).toBeNull();
    expect([r.score, r.motivo]).toStrictEqual([100, null]);
  });

  it("CAL-14 Documento no encontrado (núcleo puro)", () => {
    expect(analizarFrame(comoFrame(tablero(64, 64, 60, 190)), { cuadrilatero: null, confianza: 0.1, fuente: "modelo" }, UMBRALES_POR_DEFECTO)).toStrictEqual({
      ok: true,
      resultado: { score: 0, motivo: "acerca", metricas: null },
    });
  });

  it("CAL-02 Cuadriláteros inválidos: el análisis termina con error y sin score", () => {
    const invalidos: Cuadrilatero[] = [
      [[0, 0], [64, 64], [64, 0], [0, 64]],
      [[0, 0], [10, 0], [20, 0], [30, 0]],
      [[0.6, 0.6], [0.9, 0.6], [0.9, 0.9], [0.6, 0.9]],
      [[0, 0], [Number.NaN, 0], [64, 64], [0, 64]],
    ];
    const resultados: ResultadoAnalisis[] = invalidos.map((c) => analizarFrame(comoFrame(gris(64, 64, 128)), modelo(c), UMBRALES_POR_DEFECTO));
    expect(resultados).toStrictEqual(Array.from({ length: 4 }, () => ({ ok: false, codigo: "cuadrilatero-invalido" })));
  });

  it("CAL-09 Frame inválido: dimensiones no enteras o no positivas, o bytes que no cuadran", () => {
    const frames = [
      { ancho: 0, alto: 1, pixeles: new Uint8ClampedArray(0) },
      { ancho: 2.5, alto: 2, pixeles: new Uint8ClampedArray(20) },
      { ancho: 2, alto: -2, pixeles: new Uint8ClampedArray(16) },
      { ancho: 640, alto: 360, pixeles: new Uint8ClampedArray(100) },
      { ancho: Number.NaN, alto: 1, pixeles: new Uint8ClampedArray(4) },
    ];
    for (const f of frames) {
      expect(analizarFrame({ ...f, anchoOriginal: 1, altoOriginal: 1 }, modelo(completo(2, 2)), UMBRALES_POR_DEFECTO)).toStrictEqual({
        ok: false,
        codigo: "frame-invalido",
      });
    }
  });

  it("CAL-07 Determinismo y mínimo", () => {
    const frame = fc
      .record({ ancho: fc.integer({ min: 3, max: 64 }), alto: fc.integer({ min: 3, max: 64 }) })
      .chain(({ ancho, alto }) =>
        fc.record({
          ancho: fc.constant(ancho),
          alto: fc.constant(alto),
          // Píxeles arbitrarios (incluido alfa) desde una semilla: generar 16 KB elemento a elemento con fast-check
          // multiplicaba por diez la duración sin ampliar el dominio.
          // El techo de la intensidad (1..256) cubre de frames casi negros a ruido completo: sin él, el ruido uniforme
          // daba casi siempre el mismo motivo y la comprobación de no vacuidad fallaba de forma intermitente.
          bytes: fc.tuple(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 256 })).map(([semilla, techo]) => {
            const r = prng(semilla);
            const bytes = new Uint8Array(ancho * alto * 4);
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(r() * techo);
            return bytes;
          }),
        }),
      );
    const motivosVistos = new Set<string | null>();
    fc.assert(
      fc.property(frame, fc.boolean(), ({ ancho, alto, bytes }, conModelo) => {
        const escena = { ancho, alto, pixeles: new Uint8ClampedArray(bytes) };
        const deteccion = conModelo ? modelo(completo(ancho, alto)) : guia(completo(ancho, alto));
        const a = analizar(escena, deteccion);
        const b = analizar({ ...escena, pixeles: new Uint8ClampedArray(bytes) }, deteccion);
        expect(b).toStrictEqual(a);
        const m = a.metricas;
        if (m === null) throw new Error("métricas nulas con cuadrilátero");
        const subscores = [m.nitidez.subscore, m.reflejo.subscore, m.exposicion.subscoreOscuro, m.exposicion.subscoreSobreexpuesto];
        if (m.tamano) subscores.push(m.tamano.subscore);
        expect(m.tamano === null).toBe(!conModelo);
        expect(a.score).toBe(Math.min(...subscores));
        expect(Number.isInteger(a.score) && a.score >= 0 && a.score <= 100).toBe(true);
        expect(a.motivo === null).toBe(a.score >= UMBRALES_POR_DEFECTO.umbralListo);
        motivosVistos.add(a.motivo);
      }),
      { numRuns: 1000 },
    );
    // No vacuidad: el ruido arbitrario llega a varios motivos distintos.
    expect(motivosVistos.size).toBeGreaterThanOrEqual(2);
  });
});
