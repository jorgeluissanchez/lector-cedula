/**
 * Conversión de medidas de imagen a motivos (FRA-07 a FRA-10). Umbrales iniciales calibrados con el dataset
 * sintético (design.md, "Calibración inicial"); todo cambio pasa por la spec.
 * Cada detector combina sus señales con OR probabilístico `1 - prod(1 - w_k * s_k)` y reporta como `detalle`
 * la señal de mayor contribución.
 */
import type { CodigoMotivo, Detalle, Motivo } from "../tipos.js";
import type { MedidasImagen } from "./imagen.js";

/** Rampa lineal 0-1 entre `a` (0) y `b` (1); admite `a > b` para rampas descendentes. */
export function rampa(x: number, a: number, b: number): number {
  const t = (x - a) / (b - a);
  return Math.min(1, Math.max(0, t));
}

type Contribucion = [Detalle, number];

function combinar(codigo: CodigoMotivo, partes: readonly Contribucion[]): Motivo | null {
  let producto = 1;
  let mejor: Contribucion | null = null;
  for (const p of partes) {
    producto *= 1 - p[1];
    if (mejor === null || p[1] > mejor[1]) mejor = p;
  }
  if (mejor === null || mejor[1] <= 0) return null;
  return { codigo, puntaje: Math.round((1 - producto) * 1000) / 1000, detalle: mejor[0] };
}

/** Frecuencia (ciclos por 256 px) a partir de la cual la rejilla se considera resuelta y no aliasada. */
const FRECUENCIA_REJILLA_RESUELTA = 256 / 3;

export function puntajePantalla(m: MedidasImagen): Motivo | null {
  const periodico = rampa(m.subpixeles, 80, 150);
  return combinar("pantalla", [
    [m.frecuenciaSubpixeles >= FRECUENCIA_REJILLA_RESUELTA ? "subpixeles" : "moire", 0.9 * periodico],
    ["banding", m.banding === null ? 0 : 0.95 * rampa(m.banding, 20, 60)],
    ["marco-pantalla", 0.35 * rampa(m.luzExterior, 60, 30)],
    ["reflejo-plano", 0.25 * rampa(m.reflejo, 0.05, 0.2)],
  ]);
}

export function puntajeFotocopia(m: MedidasImagen, tipo: "amarilla" | "digital", pantalla: number): Motivo | null {
  const baja = tipo === "amarilla" ? rampa(m.saturacion, 0.38, 0.23) : rampa(m.saturacion, 0.1, 0.06);
  // Con rejilla de pantalla la textura alta se explica por los subpíxeles, no por tramado de impresión.
  const sinPantalla = 1 - rampa(pantalla, 0.3, 0.6);
  return combinar("fotocopia", [
    ["gris", 0.95 * rampa(m.saturacion, 0.06, 0.03)],
    ["baja-saturacion", 0.7 * baja],
    ["tramado", 0.85 * sinPantalla * rampa(m.texturaPlana, 8, 18)],
    ["papel", 0.5 * sinPantalla * rampa(m.texturaPlana, 1.8, 2.8)],
    ["sin-holograma", m.holograma === null ? 0 : 0.6 * rampa(m.holograma, 10, 4)],
  ]);
}

/** Relación ID-1 (85,60 / 53,98) y tolerancia (FRA-09). */
export const ASPECTO_ID1 = 85.6 / 53.98;
export const TOLERANCIA_ASPECTO = 0.03;

export function puntajeRecorte(m: MedidasImagen): Motivo | null {
  const desvio = Math.abs(m.aspecto - ASPECTO_ID1);
  const esquinas = m.esquinasDecidibles >= 3 ? (m.esquinasRectas >= 3 ? 1 : m.esquinasRectas === 2 ? 0.5 : 0) : 0;
  return combinar("recorte", [
    ["aspecto", desvio > TOLERANCIA_ASPECTO ? rampa(desvio, TOLERANCIA_ASPECTO, TOLERANCIA_ASPECTO + 0.05) : 0],
    ["esquinas-rectas", esquinas],
  ]);
}

export function puntajeEdicion(m: MedidasImagen): Motivo | null {
  return combinar("edicion", [["doble-compresion", rampa(m.dobleCompresion, 4, 12)]]);
}
