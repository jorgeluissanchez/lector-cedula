import type { Cuadrilatero } from "./tipos.js";

/** Tolerancia de la prueba de semiplanos para los centros sobre el borde (design.md, decisión 4). */
const TOLERANCIA = 1e-9;

export type ResultadoRegion =
  | { readonly ok: true; readonly mascara: Uint8Array; readonly tamano: number }
  | { readonly ok: false; readonly codigo: "cuadrilatero-invalido" };

const INVALIDO: ResultadoRegion = Object.freeze({ ok: false, codigo: "cuadrilatero-invalido" });

/** Área con signo por la fórmula del polígono (positiva en el sentido de las agujas del reloj con y hacia abajo). */
export function areaConSigno(c: Cuadrilatero): number {
  let doble = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = c[i] as readonly [number, number];
    const [x1, y1] = c[(i + 1) % 4] as readonly [number, number];
    doble += x0 * y1 - x1 * y0;
  }
  return doble / 2;
}

/** Convexo: los productos cruzados de aristas consecutivas no cambian de signo. */
function esConvexo(c: Cuadrilatero): boolean {
  let positivos = 0;
  let negativos = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = c[i] as readonly [number, number];
    const [bx, by] = c[(i + 1) % 4] as readonly [number, number];
    const [cx, cy] = c[(i + 2) % 4] as readonly [number, number];
    const cruz = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (cruz > 0) positivos++;
    else if (cruz < 0) negativos++;
  }
  return positivos === 0 || negativos === 0;
}

/**
 * M de CAL-02: píxeles cuyo centro (x + 0,5, y + 0,5) está dentro o en el borde del cuadrilátero.
 * Rechaza cuadriláteros no convexos, con coordenadas no finitas, de área cero o con M vacío.
 */
export function calcularRegion(c: Cuadrilatero, ancho: number, alto: number): ResultadoRegion {
  if (!c.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return INVALIDO;
  if (!esConvexo(c)) return INVALIDO;
  const area = areaConSigno(c);
  if (area === 0) return INVALIDO;
  const signo = area > 0 ? 1 : -1;

  const xs = c.map(([x]) => x);
  const ys = c.map(([, y]) => y);
  const xMin = Math.max(0, Math.floor(Math.min(...xs) - 0.5));
  const xMax = Math.min(ancho - 1, Math.ceil(Math.max(...xs) - 0.5));
  const yMin = Math.max(0, Math.floor(Math.min(...ys) - 0.5));
  const yMax = Math.min(alto - 1, Math.ceil(Math.max(...ys) - 0.5));

  // Semiplano de cada arista a->b orientado hacia dentro: s·((bx - ax)(py - ay) - (by - ay)(px - ax)) >= -tolerancia.
  const aristas = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = c[i] as readonly [number, number];
    const [bx, by] = c[(i + 1) % 4] as readonly [number, number];
    aristas.set([ax, ay, signo * (bx - ax), signo * (by - ay)], i * 4);
  }

  const mascara = new Uint8Array(ancho * alto);
  let tamano = 0;
  for (let y = yMin; y <= yMax; y++) {
    const py = y + 0.5;
    for (let x = xMin; x <= xMax; x++) {
      const px = x + 0.5;
      let dentro = true;
      for (let k = 0; k < 16 && dentro; k += 4) {
        const ax = aristas[k] as number;
        const ay = aristas[k + 1] as number;
        dentro = (aristas[k + 2] as number) * (py - ay) - (aristas[k + 3] as number) * (px - ax) >= -TOLERANCIA;
      }
      if (dentro) {
        mascara[y * ancho + x] = 1;
        tamano++;
      }
    }
  }
  return tamano === 0 ? INVALIDO : { ok: true, mascara, tamano };
}
