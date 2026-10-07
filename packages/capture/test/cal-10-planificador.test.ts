import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crearPlanificador } from "../src/flujo/planificador.js";

/**
 * Simula el bucle: ticks en `ticks`, cada envío tarda la latencia siguiente de `latencias` (cíclica). Las respuestas
 * cuya hora es <= que la del tick se entregan antes de ese tick. Devuelve los instantes de envío.
 */
function simular(ticks: readonly number[], latencias: readonly number[], intervalo: number) {
  let ahora = 0;
  const p = crearPlanificador(intervalo, () => ahora);
  const envios: number[] = [];
  let respuesta: number | null = null;
  let enVueloMax = 0;
  let enVuelo = 0;
  for (const t of ticks) {
    if (respuesta !== null && respuesta <= t) {
      ahora = respuesta;
      p.completar();
      enVuelo--;
      respuesta = null;
    }
    ahora = t;
    const libre = enVuelo === 0;
    const pasado = envios.length === 0 || t - (envios.at(-1) ?? 0) >= intervalo;
    const envia = p.intentar();
    // Vivacidad: si está libre y pasó el intervalo, debe enviar.
    expect(envia).toBe(libre && pasado);
    if (envia) {
      envios.push(t);
      enVuelo++;
      enVueloMax = Math.max(enVueloMax, enVuelo);
      respuesta = t + (latencias[(envios.length - 1) % latencias.length] ?? 0);
    }
  }
  return { envios, enVueloMax };
}

const ticks16 = Array.from({ length: Math.floor(1000 / 16) + 1 }, (_, i) => i * 16);

describe("CAL-10 Cadencia de análisis", { timeout: 60_000 }, () => {
  it("CAL-10 Análisis rápido", () => {
    expect(simular(ticks16, [40], 100).envios).toStrictEqual([0, 112, 224, 336, 448, 560, 672, 784, 896]);
  });

  it("CAL-10 Análisis lento", () => {
    expect(simular(ticks16, [250], 100).envios).toStrictEqual([0, 256, 512, 768]);
  });

  it("CAL-10 Estado en vuelo y reinicio", () => {
    let ahora = 0;
    const p = crearPlanificador(100, () => ahora);
    expect(p.enVuelo).toBe(false);
    expect(p.intentar()).toBe(true);
    expect(p.enVuelo).toBe(true);
    ahora = 500;
    expect(p.intentar()).toBe(false);
    p.completar();
    expect(p.enVuelo).toBe(false);
    ahora = 599;
    expect(p.intentar()).toBe(true);
    p.reiniciar();
    expect(p.enVuelo).toBe(false);
    ahora = 600;
    expect(p.intentar()).toBe(true);
  });

  it("CAL-10 Propiedad: nunca 2 en vuelo ni envíos a menos de intervaloMinimoMs", () => {
    let conEnvios = 0;
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 40, maxLength: 200 }),
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 100, max: 200 }),
        (pasos, latencias, intervalo) => {
          const ticks: number[] = [];
          let t = 0;
          for (const d of pasos) ticks.push((t += d));
          const { envios, enVueloMax } = simular(ticks, latencias, intervalo);
          expect(enVueloMax).toBeLessThanOrEqual(1);
          for (let i = 1; i < envios.length; i++) expect((envios[i] ?? 0) - (envios[i - 1] ?? 0)).toBeGreaterThanOrEqual(intervalo);
          if (envios.length >= 2) conEnvios++;
        },
      ),
      { numRuns: 1000 },
    );
    expect(conEnvios).toBeGreaterThanOrEqual(500);
  });
});
