// LMI-02, LMI-05, LMI-06 y LMI-07 (spec lectura-mrz-imagen) con Tesseract.js 7.0.0 y mrz.traineddata REALES.
// Requiere `npm run modelos:mrz`. Imágenes SINTÉTICAS (Chromium de Playwright, @lector-cedula/fixtures), en memoria.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PERSONA_BASE, generarMrzTd1 } from "@lector-cedula/fixtures";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearRenderizador } from "../../../../evals/sinteticos/render-mrz.mjs";
import { crearLectorMrz, planIntentosMrz, type LectorMrz, type ResultadoLectorMrz } from "../../src/mrz/lector.js";
import { crearWorkerTesseract, opcionesWorker } from "../../src/mrz/entorno.js";
import { girar, localizarFranjaMrz } from "../../src/mrz/localizar.js";

const RAIZ = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const MODELO = join(RAIZ, "models", "tesseract");
const REF = { fechaReferencia: "2026-10-06" };
const P = generarMrzTd1(PERSONA_BASE, { semilla: 1 });

let R: Uint8Array;
let F: Uint8Array;
/** Recorte sintético que contiene solo las 3 líneas MRZ (LMI-10). */
let M: Uint8Array;
let dimM: { width: number; height: number };
/** Foto sintética 900x1600 con textura de madera y R centrado (LMI-11). */
let T: Uint8Array;
/** R girado 90° en sentido antihorario: tarjeta en vertical, líneas MRZ verticales (LMI-12). */
let V: Uint8Array;
/** Foto 900x1600 con madera y R girado 90° horario, a 360 px de ancho en (40, 260): MRZ a la izquierda (LMI-12b). */
let G: Uint8Array;
/** Como G pero con R girado 90° antihorario en (500, 260): MRZ a la derecha (LMI-14b). */
let H: Uint8Array;
/** R girado a 700 px sobre madera: horario en (20, 200), MRZ a la izquierda; antihorario en (180, 200), MRZ a la derecha. */
let G7: Uint8Array;
let H7: Uint8Array;
/** Como la foto real (LMI-11d): 899x1599, madera, R girado a 829 px, mano color piel y JPEG de calidad 40. */
let J: Uint8Array;
let K: Uint8Array;
let lector: LectorMrz;

/** Textura de madera determinista: vetas casi verticales con ondulación y grano (sin azar). */
function madera(w: number, h: number): PNG {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const veta = Math.sin(x * 0.35 + 3 * Math.sin(y * 0.013) + 0.8 * Math.sin(x * 0.041));
      const grano = ((x * 7919 + y * 104729) % 23) - 11;
      const l = 120 + 80 * veta + grano;
      const o = (y * w + x) * 4;
      png.data[o] = Math.max(0, Math.min(255, l + 40));
      png.data[o + 1] = Math.max(0, Math.min(255, l));
      png.data[o + 2] = Math.max(0, Math.min(255, l - 45));
      png.data[o + 3] = 255;
    }
  }
  return png;
}

/** Elipse color piel (mano sintética) de semiejes 160 y 420 centrada en (cx, 1100). */
function mano(png: PNG, cx: number): void {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const dx = (x - cx) / 160;
      const dy = (y - 1100) / 420;
      if (dx * dx + dy * dy >= 1) continue;
      const o = (y * png.width + x) * 4;
      const n = ((x * 31 + y * 17) % 13) - 6;
      png.data[o] = 205 + n;
      png.data[o + 1] = 160 + n;
      png.data[o + 2] = 130 + n;
    }
  }
}

/** Pega `fuente` escalada (bilineal) a `ancho` px en `destino`, centrada salvo que se dé la esquina `en`. */
function pegarEscalada(destino: PNG, fuente: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, ancho: number, en?: { x: number; y: number }): void {
  const alto = Math.round((fuente.height * ancho) / fuente.width);
  const f = fuente.width / ancho;
  const x0 = en?.x ?? Math.round((destino.width - ancho) / 2);
  const y0 = en?.y ?? Math.round((destino.height - alto) / 2);
  for (let y = 0; y < alto; y++) {
    const sy = Math.min(fuente.height - 1, Math.max(0, (y + 0.5) * f - 0.5));
    const ya = Math.floor(sy);
    const yb = Math.min(fuente.height - 1, ya + 1);
    for (let x = 0; x < ancho; x++) {
      const sx = Math.min(fuente.width - 1, Math.max(0, (x + 0.5) * f - 0.5));
      const xa = Math.floor(sx);
      const xb = Math.min(fuente.width - 1, xa + 1);
      for (let k = 0; k < 4; k++) {
        const v = (yy: number, xx: number): number => fuente.data[(yy * fuente.width + xx) * 4 + k] as number;
        const a = v(ya, xa) * (1 - (sx - xa)) + v(ya, xb) * (sx - xa);
        const b = v(yb, xa) * (1 - (sx - xa)) + v(yb, xb) * (sx - xa);
        destino.data[((y0 + y) * destino.width + x0 + x) * 4 + k] = a * (1 - (sy - ya)) + b * (sy - ya);
      }
    }
  }
}
let vacio: string;

function lecturaCorrecta(r: ResultadoLectorMrz, v = P): void {
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.resultado.ok).toBe(true);
  const d = r.resultado.digitosControl;
  expect([d.serial.estado, d.nacimiento.estado, d.vencimiento.estado, d.compuesto.estado]).toStrictEqual(["valido", "valido", "valido", "valido"]);
  expect(r.resultado.lineasCorregidas).toStrictEqual([...v.lineasSinErrores]);
}

/** Listado recursivo: ruta relativa -> tamaño y fecha de modificación. */
function listado(dir: string, excluir: (rel: string) => boolean = () => false): Record<string, string> {
  const r: Record<string, string> = {};
  const recorrer = (actual: string): void => {
    for (const e of readdirSync(actual, { withFileTypes: true })) {
      const ruta = join(actual, e.name);
      const rel = relative(dir, ruta);
      if (excluir(rel)) continue;
      if (e.isDirectory()) recorrer(ruta);
      else {
        const s = statSync(ruta);
        r[rel] = `${s.size}:${s.mtimeMs}`;
      }
    }
  };
  recorrer(dir);
  return r;
}

// Rutas que otras pruebas del mismo `npm test` (o agentes en paralelo) crean y borran: no las crea el lector.
const AJENAS = /^(node_modules|\.git|test-results|coverage|reports|\.stryker-tmp[^\\/]*|server|apps|e2e|openspec|docs)([\\/]|$)|tmp-prueba-|[\\/]src[\\/](flujo|navegador)([\\/]|$)/u;

beforeAll(async () => {
  if (!existsSync(join(MODELO, "mrz.traineddata"))) throw new Error("falta el modelo: ejecuta npm run modelos:mrz");
  const render = await crearRenderizador();
  const r = await render.render(P.lineas);
  R = r.bytes;
  const fuente = PNG.sync.read(Buffer.from(R));
  const { x, y, ancho, alto } = r.cajaMrz;
  const recorte = new PNG({ width: ancho, height: alto });
  PNG.bitblt(fuente, recorte, x, y, ancho, alto, 0, 0);
  M = new Uint8Array(PNG.sync.write(recorte));
  dimM = { width: ancho, height: alto };
  F = (await render.render(P.lineas, { foto: true })).bytes;
  const fondo = madera(900, 1600);
  pegarEscalada(fondo, fuente, 820);
  T = new Uint8Array(PNG.sync.write(fondo));
  const girada = girar({ width: fuente.width, height: fuente.height, data: new Uint8ClampedArray(fuente.data) }, 270);
  const pv = new PNG({ width: girada.width, height: girada.height });
  pv.data.set(girada.data);
  V = new Uint8Array(PNG.sync.write(pv));
  const fondoG = madera(900, 1600);
  pegarEscalada(fondoG, girar({ width: fuente.width, height: fuente.height, data: new Uint8ClampedArray(fuente.data) }, 90), 360, { x: 40, y: 260 });
  G = new Uint8Array(PNG.sync.write(fondoG));
  const fondoH = madera(900, 1600);
  pegarEscalada(fondoH, girar({ width: fuente.width, height: fuente.height, data: new Uint8ClampedArray(fuente.data) }, 270), 360, { x: 500, y: 260 });
  H = new Uint8Array(PNG.sync.write(fondoH));
  const g7 = madera(900, 1600);
  pegarEscalada(g7, girar({ width: fuente.width, height: fuente.height, data: new Uint8ClampedArray(fuente.data) }, 90), 700, { x: 20, y: 200 });
  G7 = new Uint8Array(PNG.sync.write(g7));
  const h7 = madera(900, 1600);
  pegarEscalada(h7, girar({ width: fuente.width, height: fuente.height, data: new Uint8ClampedArray(fuente.data) }, 270), 700, { x: 180, y: 200 });
  H7 = new Uint8Array(PNG.sync.write(h7));
  const rgba = { width: fuente.width, height: fuente.height, data: new Uint8ClampedArray(fuente.data) };
  const j = madera(899, 1599);
  pegarEscalada(j, girar(rgba, 90), 829, { x: 50, y: 220 });
  mano(j, 820);
  J = new Uint8Array(jpeg.encode({ width: j.width, height: j.height, data: j.data }, 40).data);
  const k = madera(899, 1599);
  pegarEscalada(k, girar(rgba, 270), 829, { x: 20, y: 65 });
  mano(k, 80);
  K = new Uint8Array(jpeg.encode({ width: k.width, height: k.height, data: k.data }, 40).data);
  await render.cerrar();
  lector = crearLectorMrz({ rutaModelo: MODELO });
  vacio = mkdtempSync(join(tmpdir(), "mrz-sin-modelo-"));
}, 60_000);

afterAll(async () => {
  await lector?.terminar();
  if (vacio) rmSync(vacio, { recursive: true, force: true });
}, 60_000);

describe("Lector MRZ con el modelo real", { timeout: 120_000 }, () => {
  it("LMI-07 No escribe a disco", async () => {
    // Proceso hijo con `cwd` en un directorio de trabajo vacío (Tesseract.js escribe su caché relativa a `cwd`;
    // `process.chdir` no existe en los workers de Vitest/Stryker). Usa el dist construido por `tsc -b`.
    const trabajo = mkdtempSync(join(tmpdir(), "mrz-trabajo-"));
    const entrada = mkdtempSync(join(tmpdir(), "mrz-entrada-"));
    try {
      writeFileSync(join(entrada, "r.png"), R);
      const codigo = [
        `import { readFileSync } from "node:fs";`,
        `const { crearLectorMrz } = await import(${JSON.stringify(pathToFileURL(join(RAIZ, "packages", "capture", "dist", "index.js")).href)});`,
        `const l = crearLectorMrz({ rutaModelo: ${JSON.stringify(MODELO)} });`,
        `const r = await l.leer(new Uint8Array(readFileSync(${JSON.stringify(join(entrada, "r.png"))})), ${JSON.stringify(REF)});`,
        `await l.terminar();`,
        `process.stdout.write(JSON.stringify(r.ok ? r.resultado.lineasCorregidas : r));`,
      ].join("\n");
      const antes = [listado(RAIZ, (rel) => AJENAS.test(rel)), listado(trabajo), listado(entrada), listado(MODELO)];
      // Asíncrono: un spawnSync largo bloquea el worker de Vitest.
      const hijo = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", codigo], { cwd: trabajo, encoding: "utf8", timeout: 90_000 });
      expect(JSON.parse(hijo.stdout)).toStrictEqual([...P.lineasSinErrores]);
      expect(hijo.stderr).toBe("");
      const despues = [listado(RAIZ, (rel) => AJENAS.test(rel)), listado(trabajo), listado(entrada), listado(MODELO)];
      expect(despues).toStrictEqual(antes);
      expect(Object.keys(antes[1] ?? {})).toHaveLength(0);
    } finally {
      rmSync(trabajo, { recursive: true, force: true });
      rmSync(entrada, { recursive: true, force: true });
    }
  });

  it("LMI-07 Sin consola ni red", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const local = crearLectorMrz({ rutaModelo: MODELO });
      lecturaCorrecta(await local.leer(R, REF));
      await local.terminar();
      for (const e of espias) expect(e).not.toHaveBeenCalled();
      const urls = fetch.mock.calls.map((c) => String(c[0]));
      expect(urls.filter((u) => /^https?:/u.test(u))).toStrictEqual([]);
    } finally {
      for (const e of espias) e.mockRestore();
      fetch.mockRestore();
    }
  });

  it("LMI-02 Modelo ausente sin red", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const sinModelo = crearLectorMrz({ rutaModelo: vacio });
      expect(await sinModelo.leer(R, REF)).toStrictEqual({ ok: false, error: "modelo-no-disponible" });
      await sinModelo.terminar();
      expect(fetch.mock.calls.map((c) => String(c[0])).filter((u) => /^https?:/u.test(u))).toStrictEqual([]);
    } finally {
      fetch.mockRestore();
    }
  });

  it("LMI-05 Errores literales", async () => {
    const blanco = new PNG({ width: 800, height: 600 });
    blanco.data.fill(255);
    const pngBlanco = new Uint8Array(PNG.sync.write(blanco));
    expect(await lector.leer(null, REF)).toStrictEqual({ ok: false, error: "entrada-invalida" });
    expect(await lector.leer(new Uint8Array([1, 2, 3]), REF)).toStrictEqual({ ok: false, error: "imagen-ilegible" });
    expect(await lector.leer(pngBlanco, REF)).toStrictEqual({ ok: false, error: "mrz-no-encontrada" });
    expect(await lector.leer(R, { fechaReferencia: "06/10/2026" })).toStrictEqual({ ok: false, error: "fecha-referencia-invalida" });
  });

  it("LMI-06 Reverso sintético R", async () => {
    lecturaCorrecta(await lector.leer(R, REF));
  });

  it("LMI-06 Foto sintética completa", async () => {
    lecturaCorrecta(await lector.leer(F, REF));
  });

  it("LMI-10 Recorte que contiene solo la MRZ", async () => {
    const c = localizarFranjaMrz(PNG.sync.read(Buffer.from(M))).filter((x) => x.metodo !== "franja");
    expect(c.at(-1)).toStrictEqual({ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: dimM.width, alto: dimM.height } });
    const r = await lector.leer(M, REF);
    lecturaCorrecta(r);
    expect(r).toMatchObject({ ok: true, intento: "imagen-completa", digitosValidos: 4 });
  });
  it("LMI-11 Tarjeta completa en el centro de una foto vertical con textura", async () => {
    const r = await lector.leer(T, REF);
    lecturaCorrecta(r);
    expect(r).toMatchObject({ ok: true, intento: "franja", digitosValidos: 4 });
  });

  it("LMI-12 Reverso girado 90° (líneas MRZ verticales)", async () => {
    const r = await lector.leer(V, REF);
    lecturaCorrecta(r);
    expect(r.ok && r.intento.endsWith("@90")).toBe(true);
  });

  /** Lector con OCR real que cuenta las llamadas al OCR (sin límite de tiempo efectivo: bajo carga se mide por llamadas). */
  async function leerContando(imagen: Uint8Array): Promise<{ r: ResultadoLectorMrz; llamadas: number }> {
    let llamadas = 0;
    const contador = crearLectorMrz({
      rutaModelo: MODELO,
      tiempoLimiteMs: 600_000,
      // Con crearWorker inyectado el lector no resuelve la ruta del worker de Node: se piden las opciones reales.
      crearWorker: async (idioma, oem) => {
        const op = await opcionesWorker({ rutaModelo: MODELO });
        if (op === null) throw new Error("sin modelo");
        const w = await crearWorkerTesseract(idioma, oem, op);
        return { setParameters: (p) => w.setParameters(p), terminate: () => w.terminate(), recognize: (i) => (llamadas++, w.recognize(i)) };
      },
    });
    try {
      return { r: await contador.leer(imagen, REF), llamadas };
    } finally {
      await contador.terminar();
    }
  }

  // LMI-12b (<= 40 llamadas) queda cubierto por el umbral más estricto de LMI-14b (<= 12) sobre la misma foto G.
  it("LMI-12b y LMI-14b Tarjeta pequeña girada horaria sobre madera", async () => {
    const { r, llamadas } = await leerContando(G);
    lecturaCorrecta(r);
    expect(r.ok && r.intento.endsWith("@270")).toBe(true);
    expect(llamadas).toBeLessThanOrEqual(12);
  }, 300_000);

  it("LMI-14b Tarjeta pequeña girada antihoraria sobre madera", async () => {
    const { r, llamadas } = await leerContando(H);
    lecturaCorrecta(r);
    expect(r.ok && r.intento.endsWith("@90")).toBe(true);
    expect(llamadas).toBeLessThanOrEqual(12);
  }, 300_000);

  it("LMI-14b Tarjeta grande girada sobre madera", async () => {
    for (const [imagen, sufijo] of [[G7, "@270"], [H7, "@90"]] as const) {
      const { r, llamadas } = await leerContando(imagen);
      lecturaCorrecta(r);
      expect(r.ok && r.intento.endsWith(sufijo)).toBe(true);
      expect(llamadas).toBeLessThanOrEqual(12);
    }
  }, 600_000);

  it("LMI-11d Tarjeta grande girada con JPEG fuerte y una mano", async () => {
    for (const [imagen, sufijo] of [[J, "@270"], [K, "@90"]] as const) {
      const { r, llamadas } = await leerContando(imagen);
      lecturaCorrecta(r);
      expect(r.ok && r.intento.endsWith(sufijo)).toBe(true);
      expect(llamadas).toBeLessThanOrEqual(12);
    }
  }, 600_000);

  it("LMI-14b Vista derecha primero cuando tiene evidencia (madera con R centrado)", () => {
    const giros = [...new Set(planIntentosMrz(PNG.sync.read(Buffer.from(T))).map((i) => i.giro))];
    expect(giros).toStrictEqual([0, 90, 270]);
  });
});
