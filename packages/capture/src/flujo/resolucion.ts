/** CAM-04: resolución mínima 1920x1080 (lado largo y lado corto), en cualquier orientación. */
export type ClaseResolucion = "suficiente" | "baja";

export const LADO_LARGO_MINIMO = 1920;
export const LADO_CORTO_MINIMO = 1080;

export function clasificarResolucion(ancho: number, alto: number): ClaseResolucion {
  return Math.max(ancho, alto) >= LADO_LARGO_MINIMO && Math.min(ancho, alto) >= LADO_CORTO_MINIMO ? "suficiente" : "baja";
}

/** Texto del aviso persistente, o `null` si la resolución es suficiente. */
export function avisoResolucion(ancho: number, alto: number): string | null {
  if (clasificarResolucion(ancho, alto) === "suficiente") return null;
  return `Tu cámara entrega ${ancho}x${alto}; se necesitan ${LADO_LARGO_MINIMO}x${LADO_CORTO_MINIMO} para leer el código.`;
}
