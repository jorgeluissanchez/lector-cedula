import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crearAutocaptura } from "../src/flujo/autocaptura.js";

const U = { umbralListo: 70, framesConsecutivos: 3 };

function correr(scores: readonly number[]) {
  const a = crearAutocaptura(U);
  return scores.map((s) => a.registrar(s));
}

describe("CAL-11 Auto-captura", { timeout: 60_000 }, () => {
  it("CAL-11 Secuencia con interrupción", () => {
    const pasos = correr([80, 75, 60, 90, 91, 92]);
    expect(pasos.map((p) => p.cuenta)).toStrictEqual([1, 2, 0, 1, 2, 3]);
    expect(pasos.map((p) => p.solicitarCaptura)).toStrictEqual([false, false, false, false, false, true]);
  });

  it("CAL-11 Límites del umbral", () => {
    const primera = correr([70, 70, 70]);
    expect(primera.map((p) => p.solicitarCaptura)).toStrictEqual([false, false, true]);
    const segunda = correr([69, 100, 100]);
    expect(segunda.map((p) => p.cuenta)).toStrictEqual([0, 1, 2]);
    expect(segunda.some((p) => p.solicitarCaptura)).toBe(false);
  });

  it("CAL-11 Revalidación fallida y posterior éxito", () => {
    const a = crearAutocaptura(U);
    for (const s of [80, 81, 82]) a.registrar(s);
    expect(a.fase).toBe("revalidando");
    const r1 = a.revalidar({ score: 65, motivo: "desenfocado", metricas: null });
    expect(r1).toStrictEqual({ aceptada: false, cuenta: 0, pantalla: "activo" });
    expect(a.cuenta).toBe(0);
    expect(a.fase).toBe("analizando");
    expect([88, 89, 90].map((s) => a.registrar(s).solicitarCaptura)).toStrictEqual([false, false, true]);
    const calidad = { score: 85, motivo: null, metricas: null };
    const r2 = a.revalidar(calidad);
    expect(r2).toStrictEqual({ aceptada: true, cuenta: 3, pantalla: "listo", calidad });
    expect(r2.aceptada && r2.calidad.score).toBe(85);
    expect(a.fase).toBe("listo");
  });

  it("CAL-11 Resultados durante la revalidación o tras listo no cuentan", () => {
    const a = crearAutocaptura(U);
    for (const s of [80, 81, 82]) a.registrar(s);
    expect(a.registrar(99)).toStrictEqual({ cuenta: 3, solicitarCaptura: false });
    a.revalidar({ score: 70, motivo: null, metricas: null });
    expect(a.registrar(99)).toStrictEqual({ cuenta: 3, solicitarCaptura: false });
    expect(() => a.revalidar({ score: 90, motivo: null, metricas: null })).toThrow("sin-captura-solicitada");
    a.reiniciar();
    expect(a.fase).toBe("analizando");
    expect(a.cuenta).toBe(0);
  });

  it("CAL-11 Nunca captura sin la racha completa", () => {
    let conRacha = 0;
    const score = fc.integer({ min: 0, max: 100 });
    const alto = fc.integer({ min: 70, max: 100 });
    const secuencia = fc.oneof(
      fc.array(score, { minLength: 1, maxLength: 50 }),
      fc.tuple(fc.array(score, { maxLength: 23 }), fc.tuple(alto, alto, alto), fc.array(score, { maxLength: 24 })).map(([a, r, b]) => [...a, ...r, ...b]),
    );
    fc.assert(
      fc.property(secuencia, (scores) => {
        const a = crearAutocaptura(U);
        let ultimoReinicio = 0; // índice desde el que cuentan los resultados
        let tieneRacha = false;
        scores.forEach((s, i) => {
          const { solicitarCaptura } = a.registrar(s);
          const ventana = scores.slice(Math.max(ultimoReinicio, i - 2), i + 1);
          const racha = ventana.length === 3 && ventana.every((v) => v >= 70);
          if (racha) tieneRacha = true;
          expect(solicitarCaptura).toBe(racha);
          if (s < 70) ultimoReinicio = i + 1;
          if (solicitarCaptura) {
            a.revalidar({ score: 0, motivo: "desenfocado", metricas: null });
            ultimoReinicio = i + 1;
          }
        });
        if (tieneRacha) conRacha++;
      }),
      { numRuns: 1000 },
    );
    expect(conRacha).toBeGreaterThanOrEqual(500);
  });
});
