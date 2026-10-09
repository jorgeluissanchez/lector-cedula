/**
 * `evaluarFraude` (FRA-01, FRA-04 a FRA-11, FRA-18). Total: nunca lanza. La señal no contiene datos del documento
 * ni píxeles (FRA-03). Fase A: solo heurísticas.
 */
import { CODIGOS_MOTIVO, CONFIG_FRAUDE_POR_DEFECTO, UMBRAL_MOTIVO, agregarMotivos, decidirAccion, nivelPorPuntaje, validarConfigFraude } from "./config.js";
import { detectarInconsistencia } from "./detectores/inconsistencia.js";
import { type MedidasImagen, medirImagen } from "./detectores/imagen.js";
import { puntajeEdicion, puntajeFotocopia, puntajePantalla, puntajeRecorte } from "./detectores/puntajes.js";
import { HIPOTESIS_PENDIENTES } from "./hipotesis.js";
import type { FrameRGBA, Motivo, Punto, SenalRiesgo } from "./tipos.js";

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const MAX_LADO = 8192;

function frameValido(f: unknown): f is FrameRGBA {
  if (!esObjeto(f)) return false;
  const { data, width, height } = f;
  return (
    data instanceof Uint8ClampedArray &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    (width as number) >= 32 &&
    (height as number) >= 32 &&
    (width as number) <= MAX_LADO &&
    (height as number) <= MAX_LADO &&
    data.length === (width as number) * (height as number) * 4
  );
}

function cuadrilateroValido(q: unknown, f: FrameRGBA): q is [Punto, Punto, Punto, Punto] {
  if (!Array.isArray(q) || q.length !== 4) return false;
  for (const p of q) {
    if (!esObjeto(p) || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (p.x < -f.width || p.x > 2 * f.width || p.y < -f.height || p.y > 2 * f.height) return false;
  }
  const [a, b, c] = q as Punto[];
  const area = Math.abs(((b as Punto).x - (a as Punto).x) * ((c as Punto).y - (a as Punto).y) - ((c as Punto).x - (a as Punto).x) * ((b as Punto).y - (a as Punto).y));
  return area >= 32 * 32;
}

function frames(entrada: Record<string, unknown>): FrameRGBA[] | null {
  const fs = entrada.frames;
  if (!Array.isArray(fs) || fs.length < 1 || fs.length > 5) return null;
  if (!fs.every(frameValido)) return null;
  const f0 = fs[0] as FrameRGBA;
  if (!fs.every((f: FrameRGBA) => f.width === f0.width && f.height === f0.height)) return null;
  return fs as FrameRGBA[];
}

function relojSeguro(r: unknown): () => Date {
  return () => {
    try {
      const d = typeof r === "function" ? (r as () => unknown)() : undefined;
      return d instanceof Date ? d : new Date(Number.NaN);
    } catch {
      return new Date(Number.NaN);
    }
  };
}

/** Evalúa la entrada y devuelve la señal de riesgo. `config` se valida; si es inválida se usa la de por defecto. */
export function evaluarFraude(entrada: unknown, config?: unknown): SenalRiesgo {
  const warnings = new Set<string>();
  const omitidas = new Set<string>();
  const validada = validarConfigFraude(config);
  const cfg = validada.ok ? validada.config : CONFIG_FRAUDE_POR_DEFECTO;
  if (!validada.ok) warnings.add("config-fraude-invalida");
  const candidatos: Motivo[] = [];

  const e = esObjeto(entrada) ? entrada : {};
  const tipo = e.tipo === "amarilla" || e.tipo === "digital" ? e.tipo : null;
  if (tipo === null) omitidas.add("tipo");
  const fs = frames(e);
  const q = fs !== null && cuadrilateroValido(e.cuadrilatero, fs[0] as FrameRGBA) ? e.cuadrilatero : null;

  const aproximado = e.cuadrilateroAproximado === true;
  if (fs === null || q === null || tipo === null) omitidas.add("imagen");
  else {
    let m: MedidasImagen | null = null;
    try {
      m = medirImagen(fs, q, tipo === "amarilla" && !aproximado);
      if (aproximado) {
        // FRA-20: con la guía como cuadrilátero no hay bordes, esquinas, marco ni región de holograma fiables.
        m = { ...m, aspecto: 85.6 / 53.98, esquinasRectas: 0, esquinasDecidibles: 0, luzExterior: 255 };
        omitidas.add("geometria");
      }
    } catch {
      omitidas.add("imagen");
    }
    if (m !== null) {
      const pantalla = puntajePantalla(m);
      for (const motivo of [pantalla, puntajeFotocopia(m, tipo, pantalla?.puntaje ?? 0), puntajeRecorte(m), puntajeEdicion(m)]) {
        if (motivo !== null) candidatos.push(motivo);
      }
      if (m.banding === null) omitidas.add("banding");
      if (tipo === "amarilla") {
        warnings.add(HIPOTESIS_PENDIENTES.holograma);
        if (m.holograma === null) omitidas.add("holograma");
      } else warnings.add(HIPOTESIS_PENDIENTES.radioDigital);
    }
  }

  if (tipo === null) omitidas.add("datos");
  else {
    const r = detectarInconsistencia(tipo, e.datos, relojSeguro(e.reloj));
    if (r.motivo !== null) candidatos.push(r.motivo);
    for (const o of r.omitidas) omitidas.add(o);
  }

  const motivos = candidatos
    .filter((x) => x.puntaje >= UMBRAL_MOTIVO)
    .sort((a, b) => b.puntaje - a.puntaje || CODIGOS_MOTIVO.indexOf(a.codigo) - CODIGOS_MOTIVO.indexOf(b.codigo));
  const puntaje = agregarMotivos(motivos, cfg);
  if (cfg.modelo.habilitado) omitidas.add("modelo");
  return {
    version: 1,
    puntaje,
    nivel: nivelPorPuntaje(puntaje, cfg),
    motivos,
    accion: decidirAccion(puntaje, motivos, cfg),
    senalesOmitidas: [...omitidas].sort(),
    fase: "heuristica",
    warnings: [...warnings].sort(),
  };
}
