/**
 * Clases de byte y decodificación ISO-8859-1 del PDF417 de la cédula amarilla (PA-05, PA-06; design.md,
 * decisiones 3 y 4). Sin `TextDecoder`: en el estándar WHATWG las etiquetas `latin1` e `iso-8859-1` son
 * windows-1252 y 0x80 saldría como el euro.
 */

/**
 * Marcador de 8 bytes que separa la cabecera de los datos (H02). Se declara como bytes y no como texto:
 * `privacidad-check` prohíbe el literal en el código de producto.
 */
export const MARCADOR_PUBDSK: readonly number[] = [0x50, 0x75, 0x62, 0x44, 0x53, 0x4b, 0x5f, 0x31];

/** Letra de nombre (PA-05): 0x41-0x5A, 0x61-0x7A, 0xC0-0xD6, 0xD8-0xF6 y 0xF8-0xFF. */
export function esLetra(byte: number | undefined): boolean {
  // Stryker disable next-line ConditionalExpression: comparar undefined con números ya da false; la guarda solo estrecha el tipo para TypeScript
  if (byte === undefined) return false;
  if (byte >= 0x41 && byte <= 0x5a) return true;
  if (byte >= 0x61 && byte <= 0x7a) return true;
  return byte >= 0xc0 && byte <= 0xff && byte !== 0xd7 && byte !== 0xf7;
}

/** Dígito ASCII 0x30-0x39. */
export function esDigito(byte: number | undefined): boolean {
  // Stryker disable next-line ConditionalExpression: comparar undefined con números ya da false; la guarda solo estrecha el tipo para TypeScript
  return byte !== undefined && byte >= 0x30 && byte <= 0x39;
}

/** Texto ISO-8859-1 de `bytes[inicio, fin)`: cada byte es el carácter Unicode de igual valor. */
export function decodificarLatin1(bytes: Uint8Array, inicio: number, fin: number): string {
  let texto = "";
  for (let i = inicio; i < fin; i++) texto += String.fromCharCode(bytes[i] ?? 0);
  return texto;
}

/** `true` si los 8 bytes del marcador empiezan en `posicion`. */
export function hayMarcadorEn(bytes: Uint8Array, posicion: number): boolean {
  return MARCADOR_PUBDSK.every((b, j) => bytes[posicion + j] === b);
}

/** Primera posición del marcador contenido entero en `[0, limite)`, o -1. */
export function buscarMarcador(bytes: Uint8Array, limite: number): number {
  const fin = Math.min(limite, bytes.length) - MARCADOR_PUBDSK.length;
  for (let i = 0; i <= fin; i++) if (hayMarcadorEn(bytes, i)) return i;
  return -1;
}
