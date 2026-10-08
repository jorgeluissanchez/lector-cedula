// FRA-12 (cambio deteccion-fraude, tarea 4.5): latencia de evaluarFraude en Chromium real (Vitest browser mode).
import { describe, expect, it } from "vitest";
import { evaluarFraude } from "../src/index.js";
import { CLASES_SINTETICAS, generarEscena } from "../src/sintetico/index.js";

describe("FRA-12 rendimiento", { timeout: 300_000 }, () => {
  it("FRA-12 latencia: p95 <= 300 ms sobre 50 escenas sintéticas en Chromium", () => {
    const tiempos: number[] = [];
    for (let i = 0; i < 50; i++) {
      const clase = CLASES_SINTETICAS[i % CLASES_SINTETICAS.length] ?? "autentica";
      const escena = generarEscena({ tipo: i % 2 === 0 ? "amarilla" : "digital", clase, semilla: 500 + i, frames: 3 });
      const t0 = performance.now();
      evaluarFraude(escena.entrada);
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    const p95 = tiempos[Math.floor(tiempos.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    console.warn(`FRA-12 p95 Chromium: ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThanOrEqual(300);
  });
});
