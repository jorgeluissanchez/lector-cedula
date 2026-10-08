/**
 * Configuración, nivel, acción y agregación (FRA-04, FRA-05, FRA-06; design.md, decisiones 4 y 5, y decisión P3).
 * Funciones puras y totales.
 */
import type { Accion, CodigoMotivo, ConfigFraude, Motivo, Nivel, PoliticaBloqueo } from "./tipos.js";

export const CODIGOS_MOTIVO: readonly CodigoMotivo[] = Object.freeze(["pantalla", "fotocopia", "recorte", "edicion", "inconsistencia"]);

export const CONFIG_FRAUDE_POR_DEFECTO: ConfigFraude = Object.freeze({
  umbralMedio: 40,
  umbralAlto: 70,
  pesos: Object.freeze({ pantalla: 1, fotocopia: 1, recorte: 0.8, edicion: 0.5, inconsistencia: 1 }),
  modelo: Object.freeze({ habilitado: false }),
}) as ConfigFraude;

/** Puntaje mínimo de un motivo para entrar en `motivos` y en la agregación (FRA-06). */
export const UMBRAL_MOTIVO = 0.3;

export type ResultadoConfig = { ok: true; config: ConfigFraude } | { ok: false; error: "config-fraude-invalida"; campo: string };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const esEntero = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const falla = (campo: string): ResultadoConfig => ({ ok: false, error: "config-fraude-invalida", campo });

const CLAVES = new Set(["umbralMedio", "umbralAlto", "pesos", "bloquearSi", "modelo"]);
const CLAVES_BLOQUEO = new Set(["puntajeMinimo", "motivosMinimos", "motivoUnico"]);

function validarBloqueo(b: unknown): PoliticaBloqueo | string {
  if (!esObjeto(b)) return "bloquearSi";
  for (const k of Object.keys(b)) if (!CLAVES_BLOQUEO.has(k)) return `bloquearSi.${k}`;
  if (!esEntero(b.puntajeMinimo, 1, 100)) return "bloquearSi.puntajeMinimo";
  if (b.motivoUnico !== undefined && typeof b.motivoUnico !== "boolean") return "bloquearSi.motivoUnico";
  const minimo = b.motivoUnico === true ? 1 : 2;
  if (!esEntero(b.motivosMinimos, minimo, CODIGOS_MOTIVO.length)) return "bloquearSi.motivosMinimos";
  const p: PoliticaBloqueo = { puntajeMinimo: b.puntajeMinimo, motivosMinimos: b.motivosMinimos };
  if (b.motivoUnico !== undefined) p.motivoUnico = b.motivoUnico;
  return p;
}

/** Valida una configuración parcial y la completa con los valores por defecto (FRA-05). Nunca lanza. */
export function validarConfigFraude(entrada: unknown): ResultadoConfig {
  if (entrada === undefined) return { ok: true, config: CONFIG_FRAUDE_POR_DEFECTO };
  if (!esObjeto(entrada)) return falla("config");
  for (const k of Object.keys(entrada)) if (!CLAVES.has(k)) return falla(k);
  const d = CONFIG_FRAUDE_POR_DEFECTO;
  const umbralMedio = entrada.umbralMedio ?? d.umbralMedio;
  const umbralAlto = entrada.umbralAlto ?? d.umbralAlto;
  if (!esEntero(umbralMedio, 1, 100)) return falla("umbralMedio");
  if (!esEntero(umbralAlto, 1, 100) || umbralAlto <= umbralMedio) return falla("umbralAlto");
  const pesos = { ...d.pesos };
  if (entrada.pesos !== undefined) {
    if (!esObjeto(entrada.pesos)) return falla("pesos");
    for (const [k, v] of Object.entries(entrada.pesos)) {
      if (!(CODIGOS_MOTIVO as readonly string[]).includes(k) || typeof v !== "number" || !(v >= 0 && v <= 1)) return falla(`pesos.${k}`);
      pesos[k as CodigoMotivo] = v;
    }
  }
  let modelo = d.modelo;
  if (entrada.modelo !== undefined) {
    if (!esObjeto(entrada.modelo)) return falla("modelo");
    if (typeof entrada.modelo.habilitado !== "boolean") return falla("modelo.habilitado");
    modelo = { habilitado: entrada.modelo.habilitado };
  }
  const config: ConfigFraude = { umbralMedio, umbralAlto, pesos, modelo };
  if (entrada.bloquearSi !== undefined) {
    const b = validarBloqueo(entrada.bloquearSi);
    if (typeof b === "string") return falla(b);
    config.bloquearSi = b;
  }
  return { ok: true, config };
}

/** `round(100 * (1 - prod(1 - p_i * w_i)))` (FRA-06). */
export function agregarMotivos(motivos: readonly Motivo[], config: ConfigFraude): number {
  let producto = 1;
  for (const m of motivos) producto *= 1 - m.puntaje * config.pesos[m.codigo];
  return Math.round(100 * (1 - producto));
}

export function nivelPorPuntaje(puntaje: number, config: ConfigFraude): Nivel {
  if (puntaje >= config.umbralAlto) return "alto";
  if (puntaje >= config.umbralMedio) return "medio";
  return "bajo";
}

/** Bloquear exige `bloquearSi` y al menos 2 motivos distintos salvo `motivoUnico` (FRA-04, P3). */
export function decidirAccion(puntaje: number, motivos: readonly Motivo[], config: ConfigFraude): Accion {
  const b = config.bloquearSi;
  if (b !== undefined) {
    const minimo = Math.max(b.motivosMinimos, b.motivoUnico === true ? 1 : 2);
    if (puntaje >= b.puntajeMinimo && new Set(motivos.map((m) => m.codigo)).size >= minimo) return "bloquear";
  }
  return nivelPorPuntaje(puntaje, config) === "bajo" ? "continuar" : "revisar";
}
