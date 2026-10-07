// Orientación EXIF de un JPEG (cambio localizar-pdf417-en-foto, LPI-10). jpeg-js la ignora; aquí se lee la etiqueta
// 0x0112 del segmento APP1 Exif y se aplican sus 8 valores. Todo en memoria.
import type { Pixeles } from "./pixeles.js";

/** Valor de la etiqueta EXIF Orientation (1 a 8) de un JPEG; 1 si falta, es inválida o el archivo está truncado. */
export function orientacionExif(bytes: Uint8Array): number {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marcador = bytes[i + 1] as number;
    if (marcador === 0xda || marcador === 0xd9) break;
    const largo = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (marcador === 0xe1 && largo >= 8 && esExif(bytes, i + 4)) {
      const o = leerTiff(bytes, i + 10, i + 2 + largo);
      if (o !== null) return o;
    }
    i += 2 + largo;
  }
  return 1;
}

function esExif(b: Uint8Array, i: number): boolean {
  return b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0;
}

function leerTiff(b: Uint8Array, t: number, fin: number): number | null {
  const le = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return null;
  const u16 = (p: number) => (p + 2 > fin ? -1 : le ? (b[p] as number) | ((b[p + 1] as number) << 8) : ((b[p] as number) << 8) | (b[p + 1] as number));
  const u32 = (p: number) => (p + 4 > fin ? -1 : le ? u16(p) + u16(p + 2) * 65536 : u16(p) * 65536 + u16(p + 2));
  const ifd = t + u32(t + 4);
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** Aplica la orientación EXIF `o` para obtener los píxeles tal como se ven en pantalla. */
export function aplicarOrientacion(p: Pixeles, o: number): Pixeles {
  if (o < 2 || o > 8) return p;
  const W = p.width;
  const H = p.height;
  const transpuesta = o >= 5;
  const w = transpuesta ? H : W;
  const h = transpuesta ? W : H;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx: number;
      let sy: number;
      switch (o) {
        case 2: [sx, sy] = [W - 1 - x, y]; break;
        case 3: [sx, sy] = [W - 1 - x, H - 1 - y]; break;
        case 4: [sx, sy] = [x, H - 1 - y]; break;
        case 5: [sx, sy] = [y, x]; break;
        case 6: [sx, sy] = [y, H - 1 - x]; break;
        case 7: [sx, sy] = [W - 1 - y, H - 1 - x]; break;
        default: [sx, sy] = [W - 1 - y, x];
      }
      const s = (sy * W + sx) * 4;
      const d = (y * w + x) * 4;
      data[d] = p.data[s] as number;
      data[d + 1] = p.data[s + 1] as number;
      data[d + 2] = p.data[s + 2] as number;
      data[d + 3] = p.data[s + 3] as number;
    }
  }
  return { data, width: w, height: h };
}
