/**
 * Dígito de control ICAO 9303 (Doc 9303, parte 3, sección 4.9).
 *
 * Contrato: openspec/changes/parser-mrz-cedula-digital/specs/mrz-cedula-digital/spec.md, MZ-08.
 * Función pura y total: nunca lanza; devuelve `null` si la entrada no es un string del alfabeto MRZ.
 */

/** Pesos ICAO que se repiten en ciclo sobre los caracteres. */
const PESOS = [7, 3, 1] as const;

const CODIGO_0 = 48; // "0"
const CODIGO_9 = 57; // "9"
const CODIGO_A = 65; // "A"
const CODIGO_Z = 90; // "Z"
const CODIGO_RELLENO = 60; // "<"
/** Las letras valen 10 a 35: código de "A" menos 10. */
const DESPLAZAMIENTO_LETRAS = CODIGO_A - 10;

/** Valor ICAO de un carácter, o `null` si no pertenece a `0`-`9`, `A`-`Z` o `<`. */
function valorIcao(codigo: number): number | null {
  if (codigo >= CODIGO_0 && codigo <= CODIGO_9) return codigo - CODIGO_0;
  // Stryker disable next-line ArithmeticOperator: equivalente; sumar 55 en vez de restarlo cambia el valor en 110, múltiplo de 10.
  if (codigo >= CODIGO_A && codigo <= CODIGO_Z) return codigo - DESPLAZAMIENTO_LETRAS;
  if (codigo === CODIGO_RELLENO) return 0;
  return null;
}

/**
 * Calcula el dígito de control ICAO 9303 de `texto`: `0`-`9` valen su cifra, `A`-`Z` de 10 a 35 y `<` 0;
 * cada valor se multiplica por 7, 3, 1 en ciclo y la suma se reduce módulo 10. La cadena vacía da 0.
 * Si `texto` no es un string o tiene un carácter fuera del alfabeto MRZ, devuelve `null` (MZ-08).
 */
export function digitoControlIcao(texto: unknown): number | null {
  if (typeof texto !== "string") return null;
  let suma = 0;
  for (let i = 0; i < texto.length; i++) {
    const valor = valorIcao(texto.charCodeAt(i));
    if (valor === null) return null;
    suma += valor * (PESOS[i % PESOS.length] as number);
  }
  return suma % 10;
}
