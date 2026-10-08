// CAM-03 (restricciones exactas), CAM-04 (resolución), CAM-06 (enfoque) y CAM-10 (parada de pistas) del módulo de
// cámara, en Chromium real con la cámara simulada (--use-fake-device-for-media-stream). Ningún frame se guarda.
import { describe, expect, it } from "vitest";
import { iniciarCamara, RESTRICCIONES_CAMARA } from "../src/navegador/camara.js";

const LITERAL = { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } };

/** Pista sustituta para los escenarios de enfoque y resolución, sin hardware. */
function pistaFalsa(opciones: { capacidades?: unknown; rechazar?: boolean; ancho?: number; alto?: number }) {
  const llamadas: unknown[] = [];
  let detenida = false;
  const pista: Record<string, unknown> = {
    kind: "video",
    get readyState() {
      return detenida ? "ended" : "live";
    },
    stop() {
      detenida = true;
    },
    getSettings: () => ({ width: opciones.ancho ?? 1920, height: opciones.alto ?? 1080 }),
    applyConstraints(c: unknown) {
      llamadas.push(c);
      return opciones.rechazar ? Promise.reject(new DOMException("x", "OverconstrainedError")) : Promise.resolve();
    },
  };
  if (opciones.capacidades !== undefined) pista.getCapabilities = () => opciones.capacidades;
  const stream = { getTracks: () => [pista], getVideoTracks: () => [pista] } as unknown as MediaStream;
  return { llamadas, stream, pista };
}

describe("cámara en el navegador", { timeout: 60_000 }, () => {
  it("CAM-03 Restricciones exactas", async () => {
    expect(RESTRICCIONES_CAMARA).toStrictEqual(LITERAL);
    const argumentos: unknown[] = [];
    const medios = {
      getUserMedia: (c: MediaStreamConstraints) => {
        argumentos.push(structuredClone(c));
        return navigator.mediaDevices.getUserMedia(c);
      },
    };
    const camara = await iniciarCamara(medios);
    expect(argumentos).toStrictEqual([LITERAL]);
    expect(camara.stream.getVideoTracks()).toHaveLength(1);
    expect(camara.stream.getAudioTracks()).toHaveLength(0);
    camara.detener();
  });

  it("CAM-10 detener() deja todas las pistas en ended", async () => {
    const camara = await iniciarCamara(navigator.mediaDevices);
    const pistas = camara.stream.getTracks();
    expect(pistas.every((p) => p.readyState === "live")).toBe(true);
    camara.detener();
    expect(pistas.map((p) => p.readyState)).toStrictEqual(pistas.map(() => "ended"));
  });

  it("CAM-04 lee la resolución con getSettings y avisa si es baja", async () => {
    const baja = pistaFalsa({ ancho: 1280, alto: 720 });
    const c1 = await iniciarCamara({ getUserMedia: () => Promise.resolve(baja.stream) });
    expect([c1.ancho, c1.alto, c1.aviso]).toStrictEqual([1280, 720, "Tu cámara entrega 1280x720; se necesitan 1920x1080 para leer el código."]);
    const alta = pistaFalsa({});
    const c2 = await iniciarCamara({ getUserMedia: () => Promise.resolve(alta.stream) });
    expect([c2.ancho, c2.alto, c2.aviso]).toStrictEqual([1920, 1080, null]);
  });

  it("CAM-06 Pista con enfoque continuo", async () => {
    const f = pistaFalsa({ capacidades: { focusMode: ["manual", "continuous"] } });
    await iniciarCamara({ getUserMedia: () => Promise.resolve(f.stream) });
    expect(f.llamadas).toStrictEqual([{ advanced: [{ focusMode: "continuous" }] }]);
  });

  it("CAM-06 Pista sin enfoque continuo o sin getCapabilities", async () => {
    const sin = pistaFalsa({ capacidades: { focusMode: ["manual"] } });
    await iniciarCamara({ getUserMedia: () => Promise.resolve(sin.stream) });
    const sinCapacidades = pistaFalsa({});
    await iniciarCamara({ getUserMedia: () => Promise.resolve(sinCapacidades.stream) });
    const vacio = pistaFalsa({ capacidades: {} });
    await iniciarCamara({ getUserMedia: () => Promise.resolve(vacio.stream) });
    expect([sin.llamadas, sinCapacidades.llamadas, vacio.llamadas]).toStrictEqual([[], [], []]);
  });

  it("CAM-06 Rechazo de applyConstraints no rompe el inicio", async () => {
    const f = pistaFalsa({ capacidades: { focusMode: ["continuous"] }, rechazar: true });
    const camara = await iniciarCamara({ getUserMedia: () => Promise.resolve(f.stream) });
    expect(f.llamadas).toHaveLength(1);
    expect(camara.ancho).toBe(1920);
  });

  it("CAM-05 un stream sin pista de vídeo se detiene y rechaza como sin-camara", async () => {
    let detenidas = 0;
    const audio = { kind: "audio", stop: () => detenidas++ };
    const stream = { getTracks: () => [audio], getVideoTracks: () => [] } as unknown as MediaStream;
    await expect(iniciarCamara({ getUserMedia: () => Promise.resolve(stream) })).rejects.toMatchObject({ name: "NotFoundError" });
    expect(detenidas).toBe(1);
  });

  it("CAM-05 el rechazo de getUserMedia se propaga sin tocar pistas", async () => {
    const error = new DOMException("denegado", "NotAllowedError");
    await expect(iniciarCamara({ getUserMedia: () => Promise.reject(error) })).rejects.toBe(error);
  });
});
