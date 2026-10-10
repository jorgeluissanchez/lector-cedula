// fixture-sintetico: vídeos de e2e/videos/sinteticos (npm run e2e:videos), sin datos reales.
// NAT-03 y NAT-04 "Paridad con la web" (diferencial, parte TS de CT): el volcado del núcleo Kotlin
// (native/android/nucleo/build/volcados/calidad.json, escrito por `KJ`) frente a packages/capture en Node sobre el
// frame 0 de cada vídeo, con la misma conversión BT.601 y la misma reducción por área (Guia.reducir de Kotlin), y sobre
// las transformaciones de los escenarios (`<vídeo>:brillo-k`, `:disco-f`, `:desenfoque-sigma`) con la misma aritmética
// que Fixtures.kt.
// Sin volcado o sin vídeos se omite; con CT_ESTRICTO=1 falla.
import { existsSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectarPresencia, evaluarConPresencia } from "../../capture/src/calidad/presencia.js";
import { dimensionesAnalisis } from "../../capture/src/calidad/reduccion.js";
import { analizarFrame } from "../../capture/src/calidad/score.js";
import type { FrameAnalisis } from "../../capture/src/calidad/tipos.js";
import { UMBRALES_POR_DEFECTO } from "../../capture/src/calidad/umbrales.js";
import { calcularGuia, guiaEnAnalisis } from "../../capture/src/flujo/guia.js";

const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
const VIDEOS = join(RAIZ, "e2e", "videos", "sinteticos");
const VOLCADO = join(RAIZ, "native", "android", "nucleo", "build", "volcados", "calidad.json");
const ESTRICTO = process.env["CT_ESTRICTO"] === "1";
const hayDatos = existsSync(VOLCADO) && existsSync(join(VIDEOS, "amarilla-1080p.y4m"));

interface FilaVolcado {
  fixture: string;
  score: number;
  motivo: string | null;
  contenido: string | null;
}

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Frame 0 de un .y4m 4:2:0 en RGBA (BT.601 entero de rango limitado, como Fixtures.kt). */
export function frameY4m(ruta: string): { pixeles: Uint8ClampedArray; ancho: number; alto: number } {
  const fd = openSync(ruta, "r");
  try {
    const cab = Buffer.alloc(512);
    readSync(fd, cab, 0, 512, 0);
    const fin = cab.indexOf(0x0a);
    const campos = cab.subarray(0, fin).toString("latin1").split(" ");
    const w = Number(campos.find((c) => c.startsWith("W"))?.slice(1));
    const h = Number(campos.find((c) => c.startsWith("H"))?.slice(1));
    const inicioFrame = cab.indexOf(0x0a, fin + 1) + 1;
    const cw = w / 2;
    const tam = w * h + 2 * cw * (h / 2);
    const d = Buffer.alloc(tam);
    readSync(fd, d, 0, tam, inicioFrame);
    const u0 = w * h;
    const v0 = u0 + cw * (h / 2);
    const p = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = (d[y * w + x] as number) - 16;
        const dd = (d[u0 + (y >> 1) * cw + (x >> 1)] as number) - 128;
        const e = (d[v0 + (y >> 1) * cw + (x >> 1)] as number) - 128;
        const o = (y * w + x) * 4;
        p[o] = clamp((298 * c + 409 * e + 128) >> 8);
        p[o + 1] = clamp((298 * c - 100 * dd - 208 * e + 128) >> 8);
        p[o + 2] = clamp((298 * c + 516 * dd + 128) >> 8);
        p[o + 3] = 255;
      }
    }
    return { pixeles: p, ancho: w, alto: h };
  } finally {
    closeSync(fd);
  }
}

/** Reducción por área de Guia.reducir (Kotlin): media redondeada de `[floor(x·sx), floor((x+1)·sx))`. */
export function reducir(p: Uint8ClampedArray, ancho: number, alto: number): FrameAnalisis {
  const { ancho: an, alto: al } = dimensionesAnalisis(ancho, alto);
  const s = new Uint8ClampedArray(an * al * 4);
  for (let yd = 0; yd < al; yd++) {
    const y0 = Math.floor((yd * alto) / al);
    const y1 = Math.max(y0 + 1, Math.floor(((yd + 1) * alto) / al));
    for (let xd = 0; xd < an; xd++) {
      const x0 = Math.floor((xd * ancho) / an);
      const x1 = Math.max(x0 + 1, Math.floor(((xd + 1) * ancho) / an));
      const n = (y1 - y0) * (x1 - x0);
      for (let k = 0; k < 4; k++) {
        let t = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) t += p[(y * ancho + x) * 4 + k] as number;
        s[(yd * an + xd) * 4 + k] = Math.floor((t + Math.floor(n / 2)) / n);
      }
    }
  }
  return { ancho: an, alto: al, pixeles: s, anchoOriginal: ancho, altoOriginal: alto };
}

type Rgba = { pixeles: Uint8ClampedArray; ancho: number; alto: number };

const redondear = (v: number): number => clamp(Math.round(v));

/** Fixtures.brillo: cada canal RGB por `k`, redondeado y recortado. */
function brillo(f: Rgba, k: number): Rgba {
  const p = f.pixeles.slice();
  for (let i = 0; i < p.length; i++) if (i % 4 !== 3) p[i] = redondear((p[i] as number) * k);
  return { ...f, pixeles: p };
}

/** Fixtures.disco: disco blanco centrado en la guía de CAM-08 con `fraccion` de su área. */
function disco(f: Rgba, fraccion: number): Rgba {
  const g = calcularGuia(f.ancho, f.alto);
  const r = Math.sqrt((fraccion * g.ancho * g.alto) / Math.PI);
  const cx = g.x + g.ancho / 2;
  const cy = g.y + g.alto / 2;
  const p = f.pixeles.slice();
  for (let y = 0; y < f.alto; y++) {
    for (let x = 0; x < f.ancho; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) for (let k = 0; k < 3; k++) p[(y * f.ancho + x) * 4 + k] = 255;
    }
  }
  return { ...f, pixeles: p };
}

/** Fixtures.desenfoque: gaussiano separable (horizontal y luego vertical), bordes replicados, 4 canales. */
function desenfoque(f: Rgba, sigma: number): Rgba {
  const radio = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * radio + 1 }, (_, i) => Math.exp(-((i - radio) * (i - radio)) / (2 * sigma * sigma)));
  const suma = k.reduce((a, b) => a + b, 0);
  const n = k.map((v) => v / suma);
  const { ancho: w, alto: h } = f;
  const tmp = new Float64Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let a = 0;
        for (let j = -radio; j <= radio; j++) a += (n[j + radio] as number) * (f.pixeles[(y * w + Math.min(w - 1, Math.max(0, x + j))) * 4 + c] as number);
        tmp[(y * w + x) * 4 + c] = a;
      }
    }
  }
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let a = 0;
        for (let j = -radio; j <= radio; j++) a += (n[j + radio] as number) * (tmp[(Math.min(h - 1, Math.max(0, y + j)) * w + x) * 4 + c] as number);
        p[(y * w + x) * 4 + c] = redondear(a);
      }
    }
  }
  return { ...f, pixeles: p };
}

/** `<vídeo>` o `<vídeo>:<transformación>-<parámetro>` del volcado. */
export function frameDeFila(nombre: string): Rgba {
  const [video, transformacion] = nombre.split(":") as [string, string | undefined];
  const f = frameY4m(join(VIDEOS, `${video}.y4m`));
  if (transformacion === undefined) return f;
  const i = transformacion.lastIndexOf("-");
  const tipo = transformacion.slice(0, i);
  const valor = Number(transformacion.slice(i + 1));
  if (tipo === "brillo") return brillo(f, valor);
  if (tipo === "disco") return disco(f, valor);
  if (tipo === "desenfoque") return desenfoque(f, valor);
  throw new Error(`transformación desconocida: ${transformacion}`);
}

/** Evaluación del Worker de calidad con presencia y `contenidoTd` (worker-calidad.ts). */
function evaluarTs(nombre: string): FilaVolcado {
  const f = frameDeFila(nombre);
  const frame = reducir(f.pixeles, f.ancho, f.alto);
  const cuad = guiaEnAnalisis(frame.ancho, frame.alto, frame.anchoOriginal, frame.altoOriginal);
  const deteccion = { cuadrilatero: cuad, confianza: null, fuente: "guia" } as const;
  const r = analizarFrame(frame, deteccion, UMBRALES_POR_DEFECTO);
  if (!r.ok) throw new Error(r.codigo);
  let contenido: string | null = null;
  const res = evaluarConPresencia(
    r.resultado,
    () => {
      const p = detectarPresencia(frame, cuad);
      contenido = p.contenido;
      return p.presente;
    },
    UMBRALES_POR_DEFECTO.umbralListo,
  );
  return { fixture: nombre, score: res.score, motivo: res.motivo, contenido };
}

describe("NAT-03 Paridad con la web (diferencial de calidad)", { timeout: 60_000 }, () => {
  it.skipIf(!hayDatos && !ESTRICTO)("NAT-03 Paridad con la web: |score nativo - score TS| <= 2 y mismo motivo y contenido en el 100 % de los fixtures", () => {
    expect(hayDatos, "falta el volcado de KJ o los vídeos sintéticos").toBe(true);
    const volcado = JSON.parse(readFileSync(VOLCADO, "utf8")) as FilaVolcado[];
    expect(volcado.length).toBeGreaterThanOrEqual(10);
    expect(volcado.filter((f) => f.fixture.includes(":")).map((f) => f.fixture)).toStrictEqual([
      "amarilla-1080p:brillo-0.1",
      "amarilla-1080p:brillo-0.8",
      "amarilla-1080p:brillo-1.2",
      "amarilla-1080p:disco-0.15",
      "amarilla-1080p:desenfoque-6",
    ]);
    const diferencias = volcado
      .map((n) => ({ n, t: evaluarTs(n.fixture) }))
      .filter(({ n, t }) => Math.abs(n.score - t.score) > 2 || n.motivo !== t.motivo || n.contenido !== t.contenido)
      .map(({ n, t }) => `${n.fixture}: nativo ${n.score}/${n.motivo}/${n.contenido} ts ${t.score}/${t.motivo}/${t.contenido}`);
    expect(diferencias).toStrictEqual([]);
  });
});
