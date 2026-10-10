// Lector de la MRZ TD1 desde una imagen (spec lectura-mrz-imagen, LMI-02, LMI-04, LMI-05, LMI-07 y LMI-09).
// Encadena localizar -> recortar y ampliar -> OCR (Tesseract.js 7.0.0 + mrz.traineddata) -> extraer -> parsear.
// Privacidad (principio III): la imagen vive solo en memoria; sin red, sin caché en disco ni IndexedDB, sin consola.
// Tesseract.js se carga con import() diferido en la primera lectura (LMI-09).
import { type CamposMrzTd1, type ResultadoClasificacion, type ResultadoMrzCedulaDigital } from "@lector-cedula/parsers";
import { decodificarPixeles, type DecodificadorPixeles, type Pixeles } from "../pdf417/pixeles.js";
import { enderezar } from "./enderezar.js";
import { codificarPng, crearWorkerTesseract, opcionesWorker } from "./entorno.js";
import { extraerLineasMrz, extraerLineasTd3 } from "./extraer.js";
import { fechaReferenciaValida, interpretarLineasMrz } from "./interpretar.js";
import {
  esPixelesRgba,
  evidenciaTd3,
  GIROS,
  girar,
  localizarConEvidencia,
  ventanasFranja,
  type CajaMrz,
  type CandidatoMrz,
  type Giro,
  type MetodoLocalizacion,
  type PixelesRgba,
} from "./localizar.js";

/** Lista blanca y modo de segmentación del OCR (LMI-02). */
export const PARAMETROS_OCR = Object.freeze({
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
  tessedit_pageseg_mode: "6",
});

/** `OEM.LSTM_ONLY` de Tesseract.js. */
export const OEM_LSTM_ONLY = 1;

/** Ancho mínimo de la imagen que recibe el OCR (LMI-04). */
export const ANCHO_MINIMO_OCR = 900;

/** Presupuesto por defecto de LMI-13: llamadas al OCR y milisegundos por lectura. */
export const MAX_LLAMADAS_OCR = 40;
export const TIEMPO_LIMITE_MS = 60_000;

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
  /** LMI-13: máximo de llamadas al OCR por lectura (entero positivo; por defecto `MAX_LLAMADAS_OCR`). */
  readonly maxLlamadasOcr?: number;
  /** LMI-13: tiempo límite por lectura en ms (entero positivo; por defecto `TIEMPO_LIMITE_MS`). */
  readonly tiempoLimiteMs?: number;
  /** LMI-13: reloj en ms (por defecto `Date.now`). */
  readonly ahora?: () => number;
}

export type ErrorLectorMrz =
  | "entrada-invalida"
  | "imagen-ilegible"
  | "mrz-no-encontrada"
  | "modelo-no-disponible"
  | "lector-terminado"
  | "fecha-referencia-invalida";

/** Método del candidato que leyó la MRZ; con sufijo `@90`, `@180` o `@270` si se leyó sobre la imagen girada (LMI-12, LMI-12c). */
export type IntentoMrz = MetodoLocalizacion | `${MetodoLocalizacion}@${Giro}`;

export { fechaReferenciaValida, interpretarLineasMrz };

export type ResultadoParserMrz = Extract<ResultadoMrzCedulaDigital, { ok: true }>;

/** OD-21: formato de la MRZ que se busca; sin él, `"td1"`. */
export type FormatoMrz = "td1" | "td3";

/** OD-11 y OD-21: documento clasificado que no es la cédula digital (CE por TD1, pasaporte por TD3), con todos sus dígitos válidos. */
export type DocumentoMrz =
  | Extract<ResultadoClasificacion, { ok: true; tipoDocumento: "pasaporte" }>
  | { ok: true; tipoDocumento: "cedula-extranjeria"; fuente: "mrz-td1"; campos: CamposMrzTd1; warnings: string[] };

export type ResultadoLectorMrz =
  | { ok: true; intento: IntentoMrz; digitosValidos: number; resultado: ResultadoParserMrz }
  | { ok: true; intento: IntentoMrz; digitosValidos: number; documento: DocumentoMrz }
  | { ok: false; error: ErrorLectorMrz }
  | { ok: false; error: "documento-no-admitido"; warnings: string[] };

/** OD-21: `"td3"` solo si las opciones lo piden expresamente; cualquier otro valor es `"td1"`. */
export function formatoMrz(opciones: unknown): FormatoMrz {
  return typeof opciones === "object" && opciones !== null && (opciones as { formato?: unknown }).formato === "td3" ? "td3" : "td1";
}

export interface LectorMrz {
  leer(imagen: unknown, opciones?: unknown): Promise<ResultadoLectorMrz>;
  terminar(): Promise<void>;
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

/** Un intento del plan de LMI-12b: candidato de la vista girada `giro` grados en sentido horario (0 = derecha). */
export interface IntentoPlan {
  readonly giro: 0 | Giro;
  readonly candidato: CandidatoMrz;
}

const claveCaja = (c: CajaMrz): string => `${c.x},${c.y},${c.ancho},${c.alto}`;

interface Vista {
  readonly giro: 0 | Giro;
  readonly imagen: PixelesRgba;
  readonly candidatos: CandidatoMrz[];
  readonly evidencia: number | null;
  readonly ventanasMrz: number;
}

function vista(pixeles: PixelesRgba, giro: 0 | Giro): Vista {
  const imagen = giro === 0 ? pixeles : girar(pixeles, giro);
  return { giro, imagen, ...localizarConEvidencia(imagen) };
}

/** LMI-14b: evidencia de una vista para ordenarla. */
export interface EvidenciaVista {
  readonly giro: 0 | Giro;
  readonly ventanasMrz: number;
  readonly evidencia: number | null;
}

/**
 * LMI-14b y LMI-14c: giros en orden de prueba: más ventanas con MRZ horizontal en el eje (el máximo de la vista y su
 * opuesta: 0 y 180, 90 y 270, que ven las mismas líneas) primero; empate, mayor evidencia (null al final); empate, el
 * orden de entrada (derecha, 90, 270, 180).
 */
export function ordenVistasPorEvidencia(vistas: readonly EvidenciaVista[]): (0 | Giro)[] {
  const eje = (v: EvidenciaVista): number => Math.max(...vistas.filter((o) => o.giro % 180 === v.giro % 180).map((o) => o.ventanasMrz));
  // sort es estable: el último empate conserva el orden de entrada.
  return [...vistas].sort((a, b) => eje(b) - eje(a) || (b.evidencia ?? -1) - (a.evidencia ?? -1)).map((v) => v.giro);
}

/** LMI-14b: las cuatro vistas, calculadas siempre, en el orden de ordenVistasPorEvidencia. */
function ordenVistas(pixeles: PixelesRgba): Vista[] {
  const todas = [vista(pixeles, 0), ...GIROS.map((g) => vista(pixeles, g))];
  return ordenVistasPorEvidencia(todas).map((g) => todas.find((v) => v.giro === g) as Vista);
}

/**
 * LMI-12b: intentos en dos pasadas sobre las vistas (derecha, 90, 270, 180), sin cajas repetidas dentro de una vista. La
 * pasada 1 lleva los candidatos que no son ventanas literales de LMI-11; la pasada 2, las ventanas literales. Las
 * vistas van en el orden de LMI-14b.
 */
export function* intentosMrz(pixeles: PixelesRgba): Generator<IntentoPlan & { readonly imagen: PixelesRgba }> {
  const vistas: { giro: 0 | Giro; imagen: PixelesRgba; literales: CandidatoMrz[]; vistas: Set<string> }[] = [];
  for (const { giro, imagen, candidatos } of ordenVistas(pixeles)) {
    const ventanas = new Set(ventanasFranja(imagen.width, imagen.height).map((v) => claveCaja(v.caja)));
    const vista = { giro, imagen, literales: [] as CandidatoMrz[], vistas: new Set<string>() };
    vistas.push(vista);
    for (const candidato of candidatos) {
      const clave = claveCaja(candidato.caja);
      if (candidato.metodo === "franja" && ventanas.has(clave)) vista.literales.push(candidato);
      else if (!vista.vistas.has(clave)) {
        vista.vistas.add(clave);
        yield { giro, imagen, candidato };
      }
    }
  }
  for (const { giro, imagen, literales, vistas: hechas } of vistas) {
    for (const candidato of literales) {
      const clave = claveCaja(candidato.caja);
      if (hechas.has(clave)) continue;
      hechas.add(clave);
      yield { giro, imagen, candidato };
    }
  }
}

/**
 * OD-21: plan de la TD3 con el mismo plan de vistas que LMI-12b (derecha, 90, 270 y 180), ordenadas por la evidencia del
 * par TD3 (el centro más bajo primero; sin par, al final y en el orden de entrada). Pasada 1: las cajas ajustadas a un
 * par de líneas de 44 (sin repetir dentro de una vista); pasada 2: los candidatos de localizarFranjaMrz que no se probaron.
 */
export function* intentosTd3(pixeles: PixelesRgba): Generator<IntentoPlan & { readonly imagen: PixelesRgba }> {
  const vistas = ([0, ...GIROS] as (0 | Giro)[]).map((giro) => {
    const imagen = giro === 0 ? pixeles : girar(pixeles, giro);
    return { giro, imagen, ...evidenciaTd3(imagen), hechas: new Set<string>() };
  });
  // sort es estable: el empate conserva el orden de entrada.
  vistas.sort((a, b) => (b.evidencia ?? -1) - (a.evidencia ?? -1));
  for (const v of vistas) {
    for (const candidato of v.candidatos) {
      const clave = claveCaja(candidato.caja);
      if (v.hechas.has(clave)) continue;
      v.hechas.add(clave);
      yield { giro: v.giro, imagen: v.imagen, candidato };
    }
  }
  for (const v of vistas) {
    for (const candidato of localizarConEvidencia(v.imagen).candidatos) {
      const clave = claveCaja(candidato.caja);
      if (v.hechas.has(clave)) continue;
      v.hechas.add(clave);
      yield { giro: v.giro, imagen: v.imagen, candidato };
    }
  }
}

/** LMI-12b: plan completo de intentos (sin presupuesto). `[]` si la entrada no tiene forma de píxeles. */
export function planIntentosMrz(pixeles: unknown): IntentoPlan[] {
  if (!esPixelesRgba(pixeles)) return [];
  return [...intentosMrz(pixeles)].map(({ giro, candidato }) => ({ giro, candidato }));
}

const ceder = (): Promise<void> => new Promise((resolver) => setTimeout(resolver, 0));

const enteroPositivo = (x: number | undefined, defecto: number): number => (Number.isInteger(x) && (x as number) > 0 ? (x as number) : defecto);

/** Crea un lector MRZ con un único worker, creado en la primera lectura y reutilizado (LMI-02). */
export function crearLectorMrz(opciones: OpcionesLectorMrz): LectorMrz {
  const crearWorker = opciones.crearWorker ?? crearWorkerTesseract;
  const aPixeles = opciones.decodificarPixeles ?? decodificarPixeles;
  let worker: Promise<WorkerOcr | null> | null = null;
  let terminado = false;
  const maxLlamadas = enteroPositivo(opciones.maxLlamadasOcr, MAX_LLAMADAS_OCR);
  const limiteMs = enteroPositivo(opciones.tiempoLimiteMs, TIEMPO_LIMITE_MS);
  const ahora = opciones.ahora ?? Date.now;
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

    const formato = formatoMrz(op);
    // OFF-27c: tope de llamadas por lectura (`maxLlamadasOcr` en las opciones de `leer`); nunca amplía el del lector.
    const tope = Math.min(maxLlamadas, enteroPositivo((op as { maxLlamadasOcr?: number }).maxLlamadasOcr, maxLlamadas));
    let mejor: { intento: IntentoMrz; digitosValidos: number; resultado: ResultadoParserMrz } | null = null;
    let noAdmitido: { ok: false; error: "documento-no-admitido"; warnings: string[] } | null = null;
    // LMI-12, LMI-12b y LMI-12c: vistas derecha, 90°, 270° y 180° en dos pasadas. LMI-13: presupuesto de llamadas y de tiempo.
    const inicio = ahora();
    let llamadas = 0;
    const intentos = formato === "td3" ? intentosTd3(pixeles) : intentosMrz(pixeles);
    for (;;) {
      if (llamadas >= tope || ahora() - inicio >= limiteMs) break;
      // Cede el hilo antes de cada paso síncrono pesado (girar y localizar una vista, recortar y enderezar): con
      // fotos grandes bloqueaba el bucle de eventos lo bastante para agotar los RPC de Vitest bajo carga.
      await ceder();
      const paso = intentos.next();
      if (paso.done === true) break;
      const { giro, imagen: imagenVista, candidato } = paso.value;
      llamadas++;
      // Un fallo del OCR cuenta como texto ilegible; el parser rechaza `null` (sin 3 líneas) con ok: false.
      const texto: unknown = await w
        .recognize(await codificarPng(enderezar(recortarYAmpliar(imagenVista, candidato.caja))))
        .then((r) => r.data.text)
        .catch(() => "");
      const intento = `${candidato.metodo}${giro === 0 ? "" : `@${giro}`}` as IntentoMrz;
      const lectura = interpretarLineasMrz(formato === "td3" ? extraerLineasTd3(texto) : extraerLineasMrz(texto), formato, fecha, intento);
      if (!lectura.ok) {
        if (lectura.error === "documento-no-admitido") noAdmitido ??= lectura;
        continue;
      }
      if ("documento" in lectura) return lectura;
      if (mejor === null || lectura.digitosValidos > mejor.digitosValidos) mejor = lectura;
      if (lectura.digitosValidos === 4) return { ok: true, ...mejor };
    }
    if (mejor !== null) return { ok: true, ...mejor };
    return noAdmitido ?? { ok: false, error: "mrz-no-encontrada" };
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
