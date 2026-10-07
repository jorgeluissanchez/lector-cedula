// Lector de la MRZ TD1 desde una imagen (spec lectura-mrz-imagen, LMI-02, LMI-04, LMI-05, LMI-07 y LMI-09).
// Encadena localizar -> recortar y ampliar -> OCR (Tesseract.js 7.0.0 + mrz.traineddata) -> extraer -> parsear.
// Privacidad (principio III): la imagen vive solo en memoria; sin red, sin caché en disco ni IndexedDB, sin consola.
// Tesseract.js se carga con import() diferido en la primera lectura (LMI-09).
import { parsearMrzCedulaDigital, type ResultadoMrzCedulaDigital } from "@lector-cedula/parsers";
import { decodificarPixeles, type DecodificadorPixeles, type Pixeles } from "../pdf417/pixeles.js";
import { enderezar } from "./enderezar.js";
import { codificarPng, crearWorkerTesseract, opcionesWorker } from "./entorno.js";
import { extraerLineasMrz } from "./extraer.js";
import { esPixelesRgba, localizarFranjaMrz, type CajaMrz, type MetodoLocalizacion, type PixelesRgba } from "./localizar.js";

/** Lista blanca y modo de segmentación del OCR (LMI-02). */
export const PARAMETROS_OCR = Object.freeze({
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
  tessedit_pageseg_mode: "6",
});

/** `OEM.LSTM_ONLY` de Tesseract.js. */
export const OEM_LSTM_ONLY = 1;

/** Ancho mínimo de la imagen que recibe el OCR (LMI-04). */
export const ANCHO_MINIMO_OCR = 900;

/** Subconjunto del worker de Tesseract.js que usa el lector (inyectable en pruebas). */
export interface WorkerOcr {
  setParameters(parametros: Record<string, string>): Promise<unknown>;
  recognize(imagen: Uint8Array): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

export type CrearWorkerOcr = (idioma: string, oem: number, opciones: Record<string, unknown>) => Promise<WorkerOcr>;

export interface OpcionesLectorMrz {
  /** Directorio (Node) o URL (navegador) que contiene `mrz.traineddata`. */
  readonly rutaModelo: string;
  /** Solo navegador: URL local del worker de Tesseract.js (sin ella no se usa la CDN: `modelo-no-disponible`). */
  readonly rutaWorker?: string;
  /** Solo navegador: URL local del core WASM (`tesseract-core-simd-lstm.wasm.js`). */
  readonly rutaCore?: string;
  readonly crearWorker?: CrearWorkerOcr;
  readonly decodificarPixeles?: DecodificadorPixeles;
}

export type ErrorLectorMrz =
  | "entrada-invalida"
  | "imagen-ilegible"
  | "mrz-no-encontrada"
  | "modelo-no-disponible"
  | "lector-terminado"
  | "fecha-referencia-invalida";

export type ResultadoParserMrz = Extract<ResultadoMrzCedulaDigital, { ok: true }>;

export type ResultadoLectorMrz =
  | { ok: true; intento: MetodoLocalizacion; digitosValidos: number; resultado: ResultadoParserMrz }
  | { ok: false; error: ErrorLectorMrz };

export interface LectorMrz {
  leer(imagen: unknown, opciones?: unknown): Promise<ResultadoLectorMrz>;
  terminar(): Promise<void>;
}

/** `AAAA-MM-DD` existente con año 2000 a 2099 (el mismo dominio que acepta el parser). */
export function fechaReferenciaValida(opciones: unknown): string | null {
  if (typeof opciones !== "object" || opciones === null) return null;
  const f: unknown = (opciones as { fechaReferencia?: unknown }).fechaReferencia;
  const d = new Date(`${String(f)}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) return null;
  return f.startsWith("20") ? f : null;
}

/** Recorta `caja` y la amplía (bilineal) hasta `ANCHO_MINIMO_OCR` px de ancho si es más estrecha. */
export function recortarYAmpliar(p: PixelesRgba, caja: CajaMrz): Pixeles {
  const factor = Math.max(1, ANCHO_MINIMO_OCR / caja.ancho);
  const w = Math.max(caja.ancho, Math.ceil(caja.ancho * factor));
  const h = Math.max(1, Math.round(caja.alto * factor));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(caja.alto - 1, Math.max(0, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(caja.alto - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(caja.ancho - 1, Math.max(0, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(caja.ancho - 1, x0 + 1);
      const fx = sx - x0;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) {
        const v = (yy: number, xx: number): number => p.data[((caja.y + yy) * p.width + caja.x + xx) * 4 + k] as number;
        data[o + k] = (v(y0, x0) * (1 - fx) + v(y0, x1) * fx) * (1 - fy) + (v(y1, x0) * (1 - fx) + v(y1, x1) * fx) * fy;
      }
    }
  }
  return { data, width: w, height: h };
}

function contarValidos(r: ResultadoParserMrz): number {
  const d = r.digitosControl;
  return [d.serial, d.nacimiento, d.vencimiento, d.compuesto].filter((x) => x.estado === "valido").length;
}

/** Crea un lector MRZ con un único worker, creado en la primera lectura y reutilizado (LMI-02). */
export function crearLectorMrz(opciones: OpcionesLectorMrz): LectorMrz {
  const crearWorker = opciones.crearWorker ?? crearWorkerTesseract;
  const aPixeles = opciones.decodificarPixeles ?? decodificarPixeles;
  let worker: Promise<WorkerOcr | null> | null = null;
  let terminado = false;
  // Con `crearWorker` inyectado no hace falta resolver rutas de worker ni core.
  const opcionesInyectadas = opciones.crearWorker === undefined ? null : { langPath: opciones.rutaModelo, gzip: false, cacheMethod: "none" };

  async function iniciar(): Promise<WorkerOcr | null> {
    let w: WorkerOcr | undefined;
    try {
      const op = opcionesInyectadas ?? (await opcionesWorker(opciones));
      // Stryker disable next-line ConditionalExpression: con worker inyectado `op` nunca es null (rama de entorno.ts).
      if (op === null) return null;
      w = await crearWorker("mrz", OEM_LSTM_ONLY, op);
      await w.setParameters({ ...PARAMETROS_OCR });
      return w;
    } catch {
      await w?.terminate().catch(() => undefined);
      return null;
    }
  }

  async function obtenerWorker(): Promise<WorkerOcr | null> {
    worker ??= iniciar();
    const w = await worker;
    if (w === null) worker = null;
    return w;
  }

  async function leer(imagen: unknown, op?: unknown): Promise<ResultadoLectorMrz> {
    if (terminado) return { ok: false, error: "lector-terminado" };
    if (!(imagen instanceof Uint8Array) && !esPixelesRgba(imagen)) return { ok: false, error: "entrada-invalida" };
    const fecha = fechaReferenciaValida(op);
    if (fecha === null) return { ok: false, error: "fecha-referencia-invalida" };
    const pixeles: unknown = imagen instanceof Uint8Array ? await aPixeles(imagen).catch(() => null) : imagen;
    if (!esPixelesRgba(pixeles)) return { ok: false, error: "imagen-ilegible" };
    const w = await obtenerWorker();
    if (w === null) return { ok: false, error: "modelo-no-disponible" };
    if (terminado) return { ok: false, error: "lector-terminado" };

    let mejor: { intento: MetodoLocalizacion; digitosValidos: number; resultado: ResultadoParserMrz } | null = null;
    for (const { metodo, caja } of localizarFranjaMrz(pixeles)) {
      // Un fallo del OCR cuenta como texto ilegible; el parser rechaza `null` (sin 3 líneas) con ok: false.
      const texto: unknown = await w
        .recognize(await codificarPng(enderezar(recortarYAmpliar(pixeles, caja))))
        .then((r) => r.data.text)
        .catch(() => "");
      const resultado = parsearMrzCedulaDigital(extraerLineasMrz(texto), { fechaReferencia: fecha });
      if (!resultado.ok) continue;
      const digitosValidos = contarValidos(resultado);
      if (mejor === null || digitosValidos > mejor.digitosValidos) mejor = { intento: metodo, digitosValidos, resultado };
      if (digitosValidos === 4) break;
    }
    return mejor === null ? { ok: false, error: "mrz-no-encontrada" } : { ok: true, ...mejor };
  }

  async function terminar(): Promise<void> {
    terminado = true;
    const w = await worker;
    worker = null;
    await w?.terminate().catch(() => undefined);
  }

  return {
    leer: async (imagen, op) => {
      // Red de seguridad (LMI-05, nunca lanza): ninguna ruta conocida llega aquí.
      // Stryker disable next-line all: inalcanzable con las dependencias actuales.
      return leer(imagen, op).catch(() => ({ ok: false, error: "imagen-ilegible" }) as const);
    },
    terminar,
  };
}
