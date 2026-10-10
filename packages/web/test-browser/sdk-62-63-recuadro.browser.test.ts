// SDK-62 (medidas por omisión de un <video> embebido, ResizeObserver, sin tocar estilos) y SDK-63 (la captura usa la
// resolución de la pista, no el tamaño CSS) en Chromium. El vídeo sale de un canvas sintético (captureStream).
import { tomarFrameCaptura } from "@lector-cedula/capture";
import { afterEach, describe, expect, it } from "vitest";
import { medirVideoPorOmision, observarVideoPorOmision } from "../src/controlador.js";
import { crearLector } from "../src/index.js";
import { crearFalsos } from "../test/falsos.js";

let limpiar: (() => void)[] = [];
afterEach(() => {
  for (const f of limpiar) f();
  limpiar = [];
});

async function videoEmbebido(ancho: number, alto: number, css: string): Promise<HTMLVideoElement> {
  const lienzo = document.createElement("canvas");
  lienzo.width = 1280;
  lienzo.height = 720;
  const ctx = lienzo.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#777";
  ctx.fillRect(0, 0, 1280, 720);
  const flujo = lienzo.captureStream(10);
  const contenedor = document.createElement("section");
  contenedor.innerHTML = "<h2>Contenido del integrador</h2><p>Texto alrededor</p>";
  const v = document.createElement("video");
  v.muted = true;
  v.setAttribute("style", `width:${ancho}px;height:${alto}px;${css}`);
  contenedor.append(v);
  document.body.append(contenedor);
  v.srcObject = flujo;
  await v.play();
  const t = setInterval(() => ctx.fillRect(0, 0, 1, 1), 50);
  limpiar.push(() => {
    clearInterval(t);
    for (const p of flujo.getTracks()) p.stop();
    contenedor.remove();
  });
  await expect.poll(() => v.videoWidth).toBe(1280);
  return v;
}

describe("SDK-62 Recuadro embebido en el navegador", () => {
  it("SDK-62 Medidas por omisión: tamaño CSS del elemento y object-fit computado", async () => {
    const v = await videoEmbebido(260, 400, "object-fit:cover");
    expect(medirVideoPorOmision(v)).toStrictEqual({ anchoVideo: 1280, altoVideo: 720, anchoElemento: 260, altoElemento: 400, ajuste: "cover" });
    const c = await videoEmbebido(320, 200, "");
    expect(medirVideoPorOmision(c)?.ajuste).toBe("contain");
  });

  it("SDK-62 ResizeObserver avisa al redimensionar el recuadro", async () => {
    const v = await videoEmbebido(260, 400, "object-fit:cover");
    let avisos = 0;
    const parar = observarVideoPorOmision(v, () => avisos++);
    await expect.poll(() => avisos).toBeGreaterThan(0);
    const antes = avisos;
    v.style.width = "320px";
    v.style.height = "200px";
    await expect.poll(() => avisos).toBeGreaterThan(antes);
    parar();
  });

  it("SDK-62 El núcleo no toca estilos ni tamaño del vídeo ni del documento", async () => {
    const v = await videoEmbebido(260, 400, "object-fit:cover");
    const html = document.documentElement.getAttribute("style");
    const cuerpo = document.body.getAttribute("style");
    const f = crearFalsos({ manual: true });
    const c = crearLector({ guia: { orientacion: "vertical" } }, { ...f.deps, abrirCamara: async () => ({ stream: v.srcObject as MediaStream, ancho: 1280, alto: 720, detener: () => undefined }) });
    await c.iniciar(v);
    f.tick();
    await expect.poll(() => c.obtenerEstado().guiaEnPantalla).not.toBeNull();
    const g = c.obtenerEstado().guiaEnPantalla as { x: number; y: number; ancho: number; alto: number };
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x + g.ancho).toBeLessThanOrEqual(260);
    expect(g.alto).toBeGreaterThan(g.ancho);
    v.style.width = "320px";
    v.style.height = "200px";
    const estilo = v.getAttribute("style");
    await expect.poll(() => c.obtenerEstado().guiaEnPantalla?.alto ?? 0).toBeLessThanOrEqual(200);
    c.destruir();
    expect(document.documentElement.getAttribute("style")).toBe(html);
    expect(document.body.getAttribute("style")).toBe(cuerpo);
    expect(v.getAttribute("style")).toBe(estilo);
    expect(v.style.objectFit).toBe("cover");
  });
});

describe("SDK-63 Captura a resolución de la pista", () => {
  it("SDK-63 El frame de captura no depende del tamaño CSS del elemento", async () => {
    for (const [w, h] of [[260, 400], [320, 200], [64, 64]] as const) {
      const v = await videoEmbebido(w, h, "object-fit:cover");
      const f = tomarFrameCaptura(v);
      expect([f.ancho, f.alto]).toStrictEqual([1280, 720]);
      expect(f.pixeles.length).toBe(1280 * 720 * 4);
    }
  });
});
