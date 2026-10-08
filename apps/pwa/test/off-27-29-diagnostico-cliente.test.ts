// OFF-27 (pista en el mensaje al Worker lector) y OFF-29 (modo diagnóstico: solo números y códigos) de
// pwa-lectura-offline. Puerto falso en memoria; ningún dato de la cédula.
import { describe, expect, it } from "vitest";
import { diagnosticoActivo, lineasDiagnostico } from "../src/diagnostico";
import { crearClienteLector, type PuertoLector } from "../src/lectura";

function puerto() {
  const enviados: Record<string, unknown>[] = [];
  const p: PuertoLector = {
    postMessage: (mensaje: unknown) => void enviados.push(mensaje as Record<string, unknown>),
    addEventListener: () => undefined,
    terminate: () => undefined,
  };
  return { p, enviados };
}

const captura = () => ({ ancho: 2, alto: 1, pixeles: new Uint8ClampedArray(8).fill(7) });

describe("OFF-27 Pista en el cliente del Worker lector", () => {
  it("OFF-27 envía pista y respaldo en el mensaje leer", () => {
    const { p, enviados } = puerto();
    const c = crearClienteLector(p);
    void c.leer(captura(), "2026-10-06", undefined, { pista: "mrz", respaldo: false });
    void c.leer(captura(), "2026-10-06");
    expect(enviados[0]).toMatchObject({ tipo: "leer", pista: "mrz", respaldo: false });
    expect(enviados[1]).not.toHaveProperty("pista");
    expect(enviados[1]).not.toHaveProperty("respaldo");
  });
});

describe("OFF-29 Modo diagnóstico", () => {
  it("OFF-29 solo con debug=1", () => {
    expect(diagnosticoActivo("?debug=1")).toBe(true);
    expect(diagnosticoActivo("?x=2&debug=1")).toBe(true);
    for (const s of ["", "?debug=0", "?debug=true", "?depurar=1", "?debug=1x"]) expect(diagnosticoActivo(s), s).toBe(false);
  });

  it("OFF-29 líneas con solo números y códigos", () => {
    const lineas = lineasDiagnostico({
      captura: 2,
      resolucionPista: { ancho: 1920, alto: 1080 },
      pista: "pdf417",
      fotoMs: 812,
      pasos: [
        { origen: "takePhoto", ancho: 4000, alto: 3000, codigo: "pdf417-no-encontrado", ms: 1500 },
        { origen: "video", ancho: 1920, alto: 1080, codigo: "ok:pdf417:realce-x2", ms: 900 },
      ],
      totalMs: 3300,
    });
    expect(lineas).toStrictEqual([
      "captura 2",
      "pista de vídeo 1920x1080",
      "tipo detectado pdf417",
      "foto 812 ms",
      "frame 1 takePhoto 4000x3000 pdf417-no-encontrado 1500 ms",
      "frame 2 video 1920x1080 ok:pdf417:realce-x2 900 ms",
      "total 3300 ms",
    ]);
    const vacio = lineasDiagnostico({ captura: 1, resolucionPista: null, pista: null, fotoMs: null, pasos: [], totalMs: null });
    expect(vacio).toStrictEqual(["captura 1", "pista de vídeo -", "tipo detectado -", "foto no", "total -"]);
  });

  it("OFF-29 un código con texto libre se sustituye: nunca muestra datos", () => {
    const [, , , , linea] = lineasDiagnostico({
      captura: 1,
      resolucionPista: null,
      pista: null,
      fotoMs: null,
      pasos: [{ origen: "video", ancho: 1, alto: 1, codigo: "PRUEBA FICTICIA 9999123456", ms: 1 }],
      totalMs: 1,
    });
    expect(linea).toBe("frame 1 video 1x1 ? 1 ms");
  });
});
