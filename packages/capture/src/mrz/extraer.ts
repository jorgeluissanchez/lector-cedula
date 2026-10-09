// Extracción de las 3 líneas TD1 del texto OCR (spec lectura-mrz-imagen, LMI-03). Pura y total.
// No cambia caracteres internos: las correcciones OCR-B son del parser (MZ-07).

/** Longitud y márgenes de una línea TD1 (30) y TD3 (44, OD-21). */
const TD1 = { longitud: 30, minimo: 28, maximo: 32, lineas: 3 } as const;
const TD3 = { longitud: 44, minimo: 42, maximo: 46, lineas: 2 } as const;
type Medidas = typeof TD1 | typeof TD3;
const CARACTERES = /^[A-Z0-9<]+$/u;

/** Lleva una línea limpia a 30 caracteres o devuelve `null` si no es una línea MRZ plausible. */
function normalizarLinea(linea: string, m: Medidas): string | null {
  if (linea.length < m.minimo || linea.length > m.maximo || !CARACTERES.test(linea)) return null;
  if (linea.length <= m.longitud) return linea.padEnd(m.longitud, "<");
  return /^<+$/u.test(linea.slice(m.longitud)) ? linea.slice(0, m.longitud) : null;
}

function extraer(texto: unknown, m: Medidas): string[] | null {
  if (typeof texto !== "string") return null;
  const lineas = texto
    .split(/\r\n|\r|\n/u)
    .map((l) => l.replace(/[ \t]/gu, "").toUpperCase())
    .filter((l) => l !== "")
    .map((l) => normalizarLinea(l, m));
  for (let i = 0; i + m.lineas <= lineas.length; i++) {
    const grupo = lineas.slice(i, i + m.lineas);
    if (grupo.every((l) => typeof l === "string")) return grupo as string[];
  }
  return null;
}

/**
 * Devuelve las 3 primeras líneas MRZ consecutivas (sin contar líneas en blanco) del texto OCR, en mayúsculas, sin
 * espacios ni tabuladores y llevadas a 30 caracteres, o `null` si no hay 3 seguidas. Nunca lanza.
 */
export function extraerLineasMrz(texto: unknown): [string, string, string] | null {
  return extraer(texto, TD1) as [string, string, string] | null;
}

/** OD-21: como extraerLineasMrz, pero las 2 primeras líneas consecutivas de 42 a 46 caracteres, llevadas a 44 (TD3). */
export function extraerLineasTd3(texto: unknown): [string, string] | null {
  return extraer(texto, TD3) as [string, string] | null;
}
