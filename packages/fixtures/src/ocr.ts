import { ErrorFixture } from "./errores.js";
import { crearPrng } from "./prng.js";

/** Confusiones OCR-B de cada dígito (FX-20; inversa de las correcciones de la skill `formato-cedula`). */
const CONFUSIONES: Readonly<Record<string, readonly string[]>> = {
  "0": ["O", "Q"],
  "1": ["I"],
  "2": ["Z"],
  "5": ["S"],
  "6": ["G"],
  "8": ["B"],
};

/** Zonas numéricas de la MRZ (FX-20): línea (1 o 2) y posiciones de `inicio` a `fin` incluidas. */
const ZONAS: readonly (readonly [linea: 1 | 2, inicio: number, fin: number])[] = [
  [1, 5, 19],
  [2, 0, 6],
  [2, 8, 14],
  [2, 18, 27],
  [2, 29, 29],
];

/** Máximo de errores elegidos con la semilla (FX-21). */
const MAX_ERRORES = 5;

/** Una posición de la MRZ: línea desde 1 y posición desde 0. */
interface Posicion {
  readonly linea: 1 | 2;
  readonly posicion: number;
}

/** Error OCR-B que se aplicará: posición, dígito original y carácter inyectado. */
export interface Inyeccion extends Posicion {
  readonly original: string;
  readonly inyectado: string;
}

/** Plan validado: inyecciones fijas o número de errores a elegir con la semilla. */
export type PlanOcr = { readonly fijas: readonly Inyeccion[] } | { readonly errores: number };

/** Línea 1 o 2 de un par de líneas. */
const lineaDe = (lineas: readonly [string, string], linea: 1 | 2): string => (linea === 1 ? lineas[0] : lineas[1]);

const enZona = (linea: unknown, posicion: number): boolean => ZONAS.some(([l, a, b]) => l === linea && posicion >= a && posicion <= b);

const invalida = (campo: string): ErrorFixture => new ErrorFixture("opcion-ocr-invalida", campo);

/** Valida una entrada de `posicionesOcr` contra las líneas sin errores y la convierte en inyección. */
function validarPosicion(valor: unknown, lineas: readonly [string, string]): Inyeccion {
  // `null` y `undefined` no se pueden desestructurar; cualquier otro valor sin `posicion` entera se rechaza abajo.
  const { linea, posicion: p, caracter } = (valor ?? {}) as Record<string, unknown>;
  const posicion = p as number;
  if (!Number.isInteger(posicion) || !enZona(linea, posicion)) throw invalida("posicionesOcr");
  const l = linea as 1 | 2;
  const original = lineaDe(lineas, l).charAt(posicion);
  const confusiones = CONFUSIONES[original];
  if (confusiones === undefined) throw invalida("posicionesOcr");
  const inyectado = caracter === undefined ? confusiones[0] : caracter;
  if (!confusiones.includes(inyectado as string)) throw invalida("posicionesOcr");
  return { linea: l, posicion, original, inyectado: inyectado as string };
}

/**
 * Valida `erroresOcr` y `posicionesOcr` (FX-21) contra las líneas válidas 1 y 2. Devuelve `null` fuera de `ocr-b`.
 * Lanza `opcion-ocr-invalida` si se usan fuera de `ocr-b`, si se dan ambas, si `erroresOcr` no es un entero de 1 a 5
 * o si una posición no es numérica, no tiene confusión, se repite o su `caracter` no es confusión del dígito.
 */
export function validarOpcionesOcr(esOcr: boolean, errores: unknown, posiciones: unknown, lineas: readonly [string, string]): PlanOcr | null {
  if (!esOcr) {
    if (errores !== undefined) throw invalida("erroresOcr");
    if (posiciones !== undefined) throw invalida("posicionesOcr");
    return null;
  }
  if (posiciones === undefined) {
    const n = errores === undefined ? 1 : errores;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > MAX_ERRORES) throw invalida("erroresOcr");
    return { errores: n as number };
  }
  if (errores !== undefined || !Array.isArray(posiciones) || posiciones.length === 0) throw invalida("posicionesOcr");
  const fijas = posiciones.map((p: unknown) => validarPosicion(p, lineas));
  const claves = new Set(fijas.map((i) => `${i.linea}:${i.posicion}`));
  if (claves.size !== fijas.length) throw invalida("posicionesOcr");
  return { fijas };
}

/**
 * Elige con la semilla las inyecciones (design.md, decisión 7): de las posiciones elegibles en orden de zona, cada
 * error toma y quita `restantes[Math.floor(r() * restantes.length)]`; un `0` consume otra extracción para elegir
 * `O` (`r() < 0.5`) o `Q`.
 */
function elegir(errores: number, semilla: number, lineas: readonly [string, string]): Inyeccion[] {
  const restantes: { linea: 1 | 2; posicion: number; original: string; confusiones: readonly string[] }[] = [];
  for (const [linea, inicio, fin] of ZONAS) {
    for (let posicion = inicio; posicion <= fin; posicion++) {
      const original = lineaDe(lineas, linea).charAt(posicion);
      const confusiones = CONFUSIONES[original];
      if (confusiones !== undefined) restantes.push({ linea, posicion, original, confusiones });
    }
  }
  const r = crearPrng(semilla).siguiente;
  const elegidas: Inyeccion[] = [];
  while (elegidas.length < errores && restantes.length > 0) {
    const [e] = restantes.splice(Math.floor(r() * restantes.length), 1) as [(typeof restantes)[number]];
    const [primera, segunda] = e.confusiones as [string, string | undefined];
    const inyectado = segunda === undefined || r() < 0.5 ? primera : segunda;
    elegidas.push({ linea: e.linea, posicion: e.posicion, original: e.original, inyectado });
  }
  return elegidas;
}

/** Aplica el plan sobre las líneas válidas y devuelve las líneas con errores y las inyecciones en orden. */
export function inyectar(plan: PlanOcr, semilla: number, lineas: readonly [string, string]): { lineas: [string, string]; inyecciones: Inyeccion[] } {
  const inyecciones = "fijas" in plan ? [...plan.fijas] : elegir(plan.errores, semilla, lineas);
  const resultado: [string, string] = [lineas[0], lineas[1]];
  for (const { linea, posicion, inyectado } of inyecciones) {
    const l = resultado[linea - 1] as string;
    resultado[linea - 1] = l.slice(0, posicion) + inyectado + l.slice(posicion + 1);
  }
  return { lineas: resultado, inyecciones };
}
