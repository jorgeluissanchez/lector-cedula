// Renderizador sintético de la MRZ TD1 (cambio leer-mrz-desde-imagen, spec lectura-mrz-imagen, Convenciones; design.md,
// decisión 7). Dibuja con canvas 2D y FontFace en el Chromium de Playwright lanzado desde Node: reverso R(L), foto F y
// las 9 distorsiones del eval (8 leves y el reverso al revés). Todo en memoria: devuelve bytes PNG/JPEG; nada se escribe a disco.
// Solo para pruebas y evals: los datos son de @lector-cedula/fixtures (sintéticos) y la fuente OCR-B es de prueba.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { crearPrng } from "../../packages/fixtures/dist/prng.js";

const RUTA_FUENTE = new URL("./fuentes/OCRB.otf", import.meta.url);

export const ANCHO_R = 1011;
export const ALTO_R = 638;

/** Distorsiones leves del conjunto E (LMI-06). */
export const DISTORSIONES = ["rotacion+2", "rotacion-2", "blur1", "brillo+20", "brillo-20", "jpeg70", "escala0.8", "ruido8", "rotacion180"];

/** Ruido gaussiano (Box-Muller) con el PRNG mulberry32 de @lector-cedula/fixtures, redondeado a Int8. */
function ruidoGaussiano(n, sigma, semilla) {
  const r = crearPrng(semilla).siguiente;
  const ruido = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.max(r(), 1e-12);
    const v = r();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    ruido[i] = Math.max(-127, Math.min(127, Math.round(z * sigma)));
  }
  return Buffer.from(ruido.buffer).toString("base64");
}

// Código que corre en la página. Recibe la fuente en base64 la primera vez.
const SCRIPT_PAGINA = `
window.__mrz = {
  async fuente(b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const f = new FontFace("OCRB-prueba", bytes);
    await f.load();
    document.fonts.add(f);
  },
  lienzo(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; },
  reverso(lineas) {
    const c = this.lienzo(${ANCHO_R}, ${ALTO_R});
    const x = c.getContext("2d");
    x.fillStyle = "#F2EFE6"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#111111"; x.font = "28px sans-serif"; x.textBaseline = "alphabetic";
    x.fillText("REPUBLICA DE COLOMBIA - DOCUMENTO SINTETICO", 40, 60);
    x.fillStyle = "#BBBBBB"; x.fillRect(700, 120, 260, 260);
    // Caja de tinta de las 3 líneas: se dibujan aparte sobre transparente y se mide el alfa.
    const t = this.lienzo(c.width, c.height);
    const tx = t.getContext("2d");
    for (const ctx of [x, tx]) {
      ctx.fillStyle = "#111111"; ctx.font = "36px 'OCRB-prueba'"; ctx.textBaseline = "alphabetic";
      lineas.forEach((l, i) => { if (l) ctx.fillText(l, 40, 520 + 50 * i); });
    }
    const d = tx.getImageData(0, 0, t.width, t.height).data;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let yy = 0; yy < t.height; yy++) for (let xx = 0; xx < t.width; xx++) {
      if (d[(yy * t.width + xx) * 4 + 3] > 64) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    }
    const cajaMrz = x1 < 0 ? null : { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
    return { c, cajaMrz };
  },
  distorsionar(c, distorsion, ruidoB64) {
    const w = c.width, h = c.height;
    if (distorsion === "rotacion+2" || distorsion === "rotacion-2") {
      const o = this.lienzo(w, h); const x = o.getContext("2d");
      x.fillStyle = "#F2EFE6"; x.fillRect(0, 0, w, h);
      x.translate(w / 2, h / 2); x.rotate(((distorsion === "rotacion+2" ? 2 : -2) * Math.PI) / 180); x.translate(-w / 2, -h / 2);
      x.drawImage(c, 0, 0); return o;
    }
    if (distorsion === "rotacion180") {
      // mrz-giro-180 (LMI-06b): el reverso al revés.
      const o = this.lienzo(w, h); const x = o.getContext("2d");
      x.translate(w, h); x.rotate(Math.PI); x.drawImage(c, 0, 0); return o;
    }
    const filtros = { "blur1": "blur(1px)", "brillo+20": "brightness(1.2)", "brillo-20": "brightness(0.8)" };
    if (distorsion in filtros) {
      const o = this.lienzo(w, h); const x = o.getContext("2d");
      x.filter = filtros[distorsion]; x.drawImage(c, 0, 0); return o;
    }
    if (distorsion === "escala0.8") {
      const o = this.lienzo(Math.round(w * 0.8), Math.round(h * 0.8)); const x = o.getContext("2d");
      x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, o.width, o.height); return o;
    }
    if (distorsion === "ruido8") {
      const ruido = Int8Array.from(atob(ruidoB64), (ch) => (ch.charCodeAt(0) << 24) >> 24);
      const x = c.getContext("2d"); const img = x.getImageData(0, 0, w, h);
      for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) img.data[i * 4 + k] += ruido[i];
      x.putImageData(img, 0, 0); return c;
    }
    return c;
  },
  foto(c) {
    const o = this.lienzo(1920, 1080); const x = o.getContext("2d");
    x.fillStyle = "#7F7F7F"; x.fillRect(0, 0, 1920, 1080);
    const h = Math.round((c.height * 1500) / c.width);
    x.imageSmoothingQuality = "high";
    x.drawImage(c, 210, Math.round((1080 - h) / 2), 1500, h); return o;
  },
  async bytes(c, tipo, calidad) {
    const blob = await new Promise((res) => c.toBlob(res, tipo, calidad));
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s);
  },
  async render(lineas, opciones) {
    const { c, cajaMrz } = this.reverso(lineas);
    let o = opciones.distorsion ? this.distorsionar(c, opciones.distorsion, opciones.ruido) : c;
    if (opciones.foto) o = this.foto(o);
    const jpeg = opciones.distorsion === "jpeg70" || opciones.formato === "jpeg";
    const b64 = await this.bytes(o, jpeg ? "image/jpeg" : "image/png", opciones.distorsion === "jpeg70" ? 0.7 : 0.92);
    return { b64, cajaMrz, width: o.width, height: o.height };
  },
};`;

/**
 * Lanza Chromium (uno por llamada; reutilízalo en todo el archivo de prueba) y devuelve el renderizador.
 * `render(lineas, { distorsion?, foto?, formato?, semillaRuido? })` -> `{ bytes, cajaMrz, width, height }`.
 */
export async function crearRenderizador() {
  const navegador = await chromium.launch({ headless: true });
  const pagina = await navegador.newPage();
  await pagina.goto("about:blank");
  await pagina.addScriptTag({ content: SCRIPT_PAGINA });
  await pagina.evaluate((b64) => window.__mrz.fuente(b64), readFileSync(RUTA_FUENTE).toString("base64"));
  return {
    async render(lineas, opciones = {}) {
      if (opciones.distorsion !== undefined && !DISTORSIONES.includes(opciones.distorsion)) throw new Error("distorsion desconocida");
      const ruido = opciones.distorsion === "ruido8" ? ruidoGaussiano(ANCHO_R * ALTO_R, 8, opciones.semillaRuido ?? 1) : undefined;
      const r = await pagina.evaluate(([l, o]) => window.__mrz.render(l, o), [[...lineas], { ...opciones, ruido }]);
      return { bytes: new Uint8Array(Buffer.from(r.b64, "base64")), cajaMrz: r.cajaMrz, width: r.width, height: r.height };
    },
    async cerrar() {
      await navegador.close();
    },
  };
}
