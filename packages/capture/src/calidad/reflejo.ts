import { rampa } from "./rampa.js";
import type { MetricaReflejo } from "./tipos.js";

export interface UmbralesReflejo {
  readonly luminanciaSaturada: number;
  readonly fraccionSaturadaMax: number;
  readonly componenteSaturadoMax: number;
}

/**
 * Etiquetas de visita y pila explícita reutilizadas entre frames (design.md, decisión 4). Solo guardan índices de
 * píxel, nunca luminancias ni colores, y se limpian en cada llamada.
 */
let visitados = new Int32Array(0);
let pila = new Int32Array(0);

function reservar(total: number): void {
  if (visitados.length < total) {
    visitados = new Int32Array(total);
    pila = new Int32Array(total);
  } else {
    visitados.fill(0, 0, total);
  }
}

/**
 * Reflejo de CAL-04: fracción de píxeles de M con `Y >= luminanciaSaturada` y área del mayor componente 4-conexo
 * de esos píxeles dentro de M, ambas entre el tamaño de M. Subscore
 * `100 - rampa(max(fraccionSaturada / fraccionSaturadaMax, componenteMayor / componenteSaturadoMax), 0, 1)`.
 */
export function medirReflejo(
  lum: Uint8Array,
  mascara: Uint8Array,
  ancho: number,
  alto: number,
  tamanoM: number,
  u: UmbralesReflejo,
): MetricaReflejo {
  const total = ancho * alto;
  reservar(total);
  const saturado = (i: number) => mascara[i] === 1 && (lum[i] ?? 0) >= u.luminanciaSaturada;

  let saturados = 0;
  let mayor = 0;
  for (let inicio = 0; inicio < total; inicio++) {
    if (!saturado(inicio)) continue;
    saturados++;
    if (visitados[inicio] === 1) continue;
    // Recorrido del componente con pila explícita (sin recursión).
    let area = 0;
    let tope = 0;
    pila[tope++] = inicio;
    visitados[inicio] = 1;
    while (tope > 0) {
      const i = pila[--tope] as number;
      area++;
      const x = i % ancho;
      const vecinos = [x > 0 ? i - 1 : -1, x < ancho - 1 ? i + 1 : -1, i - ancho, i + ancho];
      for (const v of vecinos) {
        if (v >= 0 && v < total && visitados[v] !== 1 && saturado(v)) {
          visitados[v] = 1;
          pila[tope++] = v;
        }
      }
    }
    if (area > mayor) mayor = area;
  }

  const fraccionSaturada = saturados / tamanoM;
  const componenteMayor = mayor / tamanoM;
  const peor = Math.max(fraccionSaturada / u.fraccionSaturadaMax, componenteMayor / u.componenteSaturadoMax);
  return { fraccionSaturada, componenteMayor, subscore: 100 - rampa(peor, 0, 1) };
}
