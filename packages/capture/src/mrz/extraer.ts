// Extracción de las 3 líneas TD1 del texto OCR (spec lectura-mrz-imagen, LMI-03). Pura y total.
// No cambia caracteres internos: las correcciones OCR-B son del parser (MZ-07).

const LONGITUD = 30;
const MINIMO = 28;
const MAXIMO = 32;
const CARACTERES = /^[A-Z0-9<]+$/u;

/** Lleva una línea limpia a 30 caracteres o devuelve `null` si no es una línea MRZ plausible. */
function normalizarLinea(linea: string): string | null {
  if (linea.length < MINIMO || linea.length > MAXIMO || !CARACTERES.test(linea)) return null;
  if (linea.length <= LONGITUD) return linea.padEnd(LONGITUD, "<");
  return /^<+$/u.test(linea.slice(LONGITUD)) ? linea.slice(0, LONGITUD) : null;
}

/**
 * Devuelve las 3 primeras líneas MRZ consecutivas (sin contar líneas en blanco) del texto OCR, en mayúsculas, sin
 * espacios ni tabuladores y llevadas a 30 caracteres, o `null` si no hay 3 seguidas. Nunca lanza.
 */
export function extraerLineasMrz(texto: unknown): [string, string, string] | null {
  if (typeof texto !== "string") return null;
  const lineas = texto
    .split(/\r\n|\r|\n/u)
    .map((l) => l.replace(/[ \t]/gu, "").toUpperCase())
    .filter((l) => l !== "")
    .map(normalizarLinea);
  for (let i = 0; i + 3 <= lineas.length; i++) {
    const [a, b, c] = lineas.slice(i, i + 3);
    if (typeof a === "string" && typeof b === "string" && typeof c === "string") return [a, b, c];
  }
  return null;
}
