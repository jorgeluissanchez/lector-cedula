// OFF-22 en el Worker de calidad (transporte en Node con un alcance falso): con la presencia activada, una escena
// nítida sin cédula nunca supera el umbral de listo (motivo acerca); sin ella, el comportamiento de CAL-09 no cambia.
import { describe, expect, it } from "vitest";
import type { FrameAnalisis } from "../../src/calidad/tipos.js";
import { crearDetectorGuia } from "../../src/flujo/guia.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";
import type { MensajeDelWorker } from "../../src/navegador/protocolo.js";
import { pared } from "./escenas-presencia.js";

function worker(conPresencia: boolean) {
  const recibidos: MensajeDelWorker[] = [];
  const alcance: AlcanceWorker = { onmessage: null, postMessage: (m) => void recibidos.push(m) };
  iniciarWorkerCalidad(alcance, crearDetectorGuia(), conPresencia ? { presencia: true } : undefined);
  const analizar = async (f: FrameAnalisis) => {
    const pixeles = new Uint8ClampedArray(f.pixeles).buffer;
    alcance.onmessage?.({ data: { tipo: "analizar", id: 1, ancho: f.ancho, alto: f.alto, anchoOriginal: f.anchoOriginal, altoOriginal: f.altoOriginal, pixeles } } as MessageEvent);
    await expect.poll(() => recibidos.length).toBe(1);
    return recibidos[0] as Extract<MensajeDelWorker, { tipo: "resultado" }>;
  };
  return { analizar };
}

describe("OFF-22 Worker de calidad con presencia", () => {
  it("OFF-22 pared nítida: sin presencia puede llegar al umbral; con presencia, score < 70 y motivo acerca", async () => {
    const sin = await worker(false).analizar(pared());
    const con = await worker(true).analizar(pared());
    expect(sin.tipo).toBe("resultado");
    expect(sin.resultado.score).toBeGreaterThanOrEqual(70);
    expect(con.resultado.score).toBeLessThan(70);
    expect(con.resultado.motivo).toBe("acerca");
  });
});
