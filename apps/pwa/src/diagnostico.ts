/**
 * OFF-29: modo diagnóstico con `?debug=1`. Solo números y códigos (resoluciones, tipo detectado, origen y código de
 * cada frame, tiempos); nunca campos de la cédula ni imágenes. Vive en memoria; nada se guarda.
 */
import type { PasoSecuencia } from "./secuencia";

export interface Diagnostico {
  /** Número de captura dentro de los reintentos (OFF-26). */
  readonly captura: number;
  readonly resolucionPista: { readonly ancho: number; readonly alto: number } | null;
  readonly pista: "pdf417" | "mrz" | null;
  readonly fotoMs: number | null;
  readonly pasos: readonly PasoSecuencia[];
  readonly totalMs: number | null;
}

export function diagnosticoActivo(busqueda: string): boolean {
  return new URLSearchParams(busqueda).get("debug") === "1";
}

// Solo códigos generados por el lector: `ok:<tipo>:<intento>` o un código de error en minúsculas.
const CODIGO = /^(ok:(pdf417|mrz):[a-z][a-z0-9.+-]*|[a-z][a-z0-9-]*)$/u;

const entero = (n: number): string => String(Math.round(n));
const ms = (n: number | null): string => (n === null ? "-" : `${entero(n)} ms`);

export function lineasDiagnostico(d: Diagnostico): string[] {
  const r = d.resolucionPista;
  return [
    `captura ${entero(d.captura)}`,
    `pista de vídeo ${r === null ? "-" : `${entero(r.ancho)}x${entero(r.alto)}`}`,
    `tipo detectado ${d.pista ?? "-"}`,
    `foto ${d.fotoMs === null ? "no" : ms(d.fotoMs)}`,
    ...d.pasos.map(
      (p, i) =>
        `frame ${i + 1} ${p.origen === "takePhoto" ? "takePhoto" : "video"} ${entero(p.ancho)}x${entero(p.alto)} ${CODIGO.test(p.codigo) ? p.codigo : "?"} ${ms(p.ms)}`,
    ),
    `total ${ms(d.totalMs)}`,
  ];
}
