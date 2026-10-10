// MOT-05 (D3 de design.md): ancho y alto leídos de la cabecera antes de entregar la imagen a un decodificador, para
// rechazar bombas de descompresión sin asignar sus píxeles. Puro y sin dependencias; nunca lanza.

export type FormatoImagen = "png" | "jpeg" | "webp";

export interface Cabecera {
  readonly formato: FormatoImagen;
  readonly ancho: number;
  readonly alto: number;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function empieza(b: Uint8Array, firma: readonly number[], desde = 0): boolean {
  // Stryker disable next-line ConditionalExpression,EqualityOperator,ArithmeticOperator: equivalente; un byte ausente es undefined y nunca coincide con la firma.
  return b.length >= desde + firma.length && firma.every((x, i) => b[desde + i] === x);
}

function texto(b: Uint8Array, desde: number, n: number): string {
  return String.fromCharCode(...b.subarray(desde, desde + n));
}

const u8 = (b: Uint8Array, i: number): number => b[i] ?? 0;
const be16 = (b: Uint8Array, i: number): number => (u8(b, i) << 8) | u8(b, i + 1);
const be32 = (b: Uint8Array, i: number): number => be16(b, i) * 0x10000 + be16(b, i + 2);
const le16 = (b: Uint8Array, i: number): number => u8(b, i) | (u8(b, i + 1) << 8);
const le24 = (b: Uint8Array, i: number): number => le16(b, i) | (u8(b, i + 2) << 16);

function cabecera(formato: FormatoImagen, ancho: number, alto: number): Cabecera | null {
  return ancho > 0 && alto > 0 ? { formato, ancho, alto } : null;
}

function png(b: Uint8Array): Cabecera | null {
  if (b.length < 24 || texto(b, 12, 4) !== "IHDR") return null;
  return cabecera("png", be32(b, 16), be32(b, 20));
}

/** SOF0 a SOF15 salvo DHT (C4), JPG (C8) y DAC (CC). */
function esSof(m: number): boolean {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

function jpeg(b: Uint8Array): Cabecera | null {
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = u8(b, i + 1);
    if (marcador === 0xff) {
      i++;
      continue;
    }
    // Marcadores sin longitud: TEM, RSTn, SOI. EOI o SOS sin SOF antes: no hay dimensiones.
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
      i += 2;
      continue;
    }
    if (marcador === 0xd9 || marcador === 0xda) return null;
    if (i + 3 >= b.length) return null;
    const longitud = be16(b, i + 2);
    if (longitud < 2) return null;
    if (esSof(marcador)) {
      if (i + 8 >= b.length) return null;
      return cabecera("jpeg", be16(b, i + 7), be16(b, i + 5));
    }
    i += 2 + longitud;
  }
  return null;
}

function webp(b: Uint8Array): Cabecera | null {
  if (b.length < 16 || texto(b, 8, 4) !== "WEBP") return null;
  const chunk = texto(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b.length < 30 || !empieza(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return cabecera("webp", le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const b1 = u8(b, 21);
    const b2 = u8(b, 22);
    const b3 = u8(b, 23);
    const b4 = u8(b, 24);
    return cabecera("webp", 1 + (b1 | ((b2 & 0x3f) << 8)), 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)));
  }
  if (chunk === "VP8X" && b.length >= 30) return cabecera("webp", 1 + le24(b, 24), 1 + le24(b, 27));
  return null;
}

export function leerCabecera(bytes: Uint8Array): Cabecera | null {
  if (empieza(bytes, FIRMA_PNG)) return png(bytes);
  if (empieza(bytes, [0xff, 0xd8])) return jpeg(bytes);
  if (empieza(bytes, [0x52, 0x49, 0x46, 0x46])) return webp(bytes);
  return null;
}
