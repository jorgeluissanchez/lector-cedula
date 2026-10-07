// CAM-07 (frames tomados del <video> en vivo con drawImage) y CAM-11 "Borrado de la captura" en Chromium real.
// El <video> se alimenta con canvas.captureStream() de un canvas sintético; nada se guarda ni sale de la página.
import { afterEach, describe, expect, it } from "vitest";
import type { ResultadoCalidad } from "../src/calidad/tipos.js";
import { crearCapturaAceptada } from "../src/navegador/captura.js";
import { tomarFrameAnalisis, tomarFrameCaptura } from "../src/navegador/frames.js";

const COLOR = [40, 120, 200] as const;
const limpiar: (() => void)[] = [];
afterEach(() => {
  for (const f of limpiar.splice(0)) f();
});

async function videoDesdeCanvas(ancho: number, alto: number): Promise<HTMLVideoElement> {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (ctx === null) throw new Error("sin 2d");
  const pintar = () => {
    ctx.fillStyle = `rgb(${COLOR.join(",")})`;
    ctx.fillRect(0, 0, ancho, alto);
  };
  pintar();
  const stream = lienzo.captureStream(30);
  const intervalo = setInterval(pintar, 30);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  document.body.append(video);
  limpiar.push(() => {
    clearInterval(intervalo);
    for (const p of stream.getTracks()) p.stop();
    video.srcObject = null;
    video.remove();
  });
  await video.play();
  await new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
  return video;
}

const calidad: ResultadoCalidad = { score: 90, motivo: null, metricas: null };

describe("CAM-07 Frame tomado del vídeo en vivo", { timeout: 60_000 }, () => {
  it("CAM-07 Resolución del frame de captura", async () => {
    const video = await videoDesdeCanvas(1920, 1080);
    const f = tomarFrameCaptura(video);
    expect([f.ancho, f.alto, f.pixeles.byteLength]).toStrictEqual([1920, 1080, 8294400]);
    const centro = ((540 * 1920) + 960) * 4;
    for (let c = 0; c < 3; c++) expect(Math.abs((f.pixeles[centro + c] ?? -99) - (COLOR[c] ?? 0))).toBeLessThanOrEqual(3);
  });

  it("CAM-07 Resolución del frame de análisis", async () => {
    const video = await videoDesdeCanvas(1920, 1080);
    const f = tomarFrameAnalisis(video, video.videoWidth, video.videoHeight);
    expect([f.ancho, f.alto, f.pixeles.byteLength, f.anchoOriginal, f.altoOriginal]).toStrictEqual([640, 360, 921600, 1920, 1080]);
  });

  it("CAM-07 Frame de análisis reducido desde el frame de captura (revalidación)", async () => {
    const video = await videoDesdeCanvas(1920, 1080);
    const captura = tomarFrameCaptura(video);
    const lienzo = new OffscreenCanvas(captura.ancho, captura.alto);
    lienzo.getContext("2d")?.putImageData(new ImageData(captura.pixeles, captura.ancho, captura.alto), 0, 0);
    const f = tomarFrameAnalisis(lienzo, captura.ancho, captura.alto);
    expect([f.ancho, f.alto]).toStrictEqual([640, 360]);
    expect(Math.abs((f.pixeles[(180 * 640 + 320) * 4] ?? -99) - COLOR[0])).toBeLessThanOrEqual(3);
  });

  it("CAM-07 Vídeo sin dimensiones todavía", () => {
    const video = document.createElement("video");
    expect(() => tomarFrameCaptura(video)).toThrow("video-sin-frame");
  });
});

describe("CAM-11 Ningún frame persiste ni sale del dispositivo", { timeout: 60_000 }, () => {
  it("CAM-11 Borrado de la captura", async () => {
    const video = await videoDesdeCanvas(1920, 1080);
    const f = tomarFrameCaptura(video);
    const captura = crearCapturaAceptada({ ...f, cuadrilatero: [[190, 54], [1731, 54], [1731, 1026], [190, 1026]], calidad });
    expect(captura.liberada).toBe(false);
    expect(captura.pixeles.some((v) => v !== 0)).toBe(true);
    captura.liberar();
    expect(captura.pixeles.byteLength).toBe(8294400);
    expect(captura.pixeles.every((v) => v === 0)).toBe(true);
    expect(captura.liberada).toBe(true);
    captura.liberar();
    expect(captura.liberada).toBe(true);
    expect([captura.ancho, captura.alto, captura.calidad]).toStrictEqual([1920, 1080, calidad]);
  });
});
