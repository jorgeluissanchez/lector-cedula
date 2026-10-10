/**
 * Estado inmutable del núcleo (SDK-28): objetos congelados, guía normalizada y sin cambios redundantes (si nada cambia,
 * se devuelve la misma referencia y el controlador no notifica).
 */
import type { EstadoLector, GuiaLector, Rectangulo } from "./tipos.js";

export const ESTADO_INICIAL: EstadoLector = congelar({
  fase: "inicio",
  calidad: null,
  guia: null,
  guiaEnPantalla: null,
  contenido: null,
  progreso: null,
  intento: 1,
  resultado: null,
  error: null,
  envio: null,
  verificacion: null,
  rechazo: null,
  intentosVerificacion: null,
  modo: null,
  validacion: null,
  frontActivo: null,
  modoMotivo: null,
});

function congelarProfundo<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    for (const k of Object.keys(v)) congelarProfundo((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

export function congelar(e: EstadoLector): EstadoLector {
  return congelarProfundo(e);
}

/** Igualdad estructural de valores JSON (sin ciclos). */
export function iguales(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && iguales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Nuevo estado congelado con `cambios`, o `e` si no cambia nada. */
export function actualizar(e: EstadoLector, cambios: Partial<EstadoLector>): EstadoLector {
  const siguiente = { ...e, ...cambios };
  return iguales(e, siguiente) ? e : congelar(siguiente);
}

const acotar = (v: number): number => Math.min(1, Math.max(0, v));

/** Guía en píxeles del vídeo y normalizada a [0, 1]; `null` con dimensiones no positivas. */
export function normalizarGuia(guia: Rectangulo, anchoVideo: number, altoVideo: number): GuiaLector | null {
  if (!(anchoVideo > 0 && altoVideo > 0)) return null;
  return {
    video: { x: guia.x, y: guia.y, ancho: guia.ancho, alto: guia.alto },
    normalizada: {
      x: acotar(guia.x / anchoVideo),
      y: acotar(guia.y / altoVideo),
      ancho: acotar(guia.ancho / anchoVideo),
      alto: acotar(guia.alto / altoVideo),
    },
  };
}
