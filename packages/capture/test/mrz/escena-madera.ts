// Escenas sintéticas compartidas por las pruebas con OCR real (LMI y OD-21): fondo de madera y pegado escalado.
import { PNG } from "pngjs";

/** Textura de madera determinista: vetas casi verticales con ondulación y grano (sin azar). */
export function madera(w: number, h: number): PNG {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const veta = Math.sin(x * 0.35 + 3 * Math.sin(y * 0.013) + 0.8 * Math.sin(x * 0.041));
      const grano = ((x * 7919 + y * 104729) % 23) - 11;
      const l = 120 + 80 * veta + grano;
      const o = (y * w + x) * 4;
      png.data[o] = Math.max(0, Math.min(255, l + 40));
      png.data[o + 1] = Math.max(0, Math.min(255, l));
      png.data[o + 2] = Math.max(0, Math.min(255, l - 45));
      png.data[o + 3] = 255;
    }
  }
  return png;
}

/** Pega `fuente` escalada (bilineal) a `ancho` px en `destino`, centrada salvo que se dé la esquina `en`. */
export function pegarEscalada(destino: PNG, fuente: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, ancho: number, en?: { x: number; y: number }): void {
  const alto = Math.round((fuente.height * ancho) / fuente.width);
  const f = fuente.width / ancho;
  const x0 = en?.x ?? Math.round((destino.width - ancho) / 2);
  const y0 = en?.y ?? Math.round((destino.height - alto) / 2);
  for (let y = 0; y < alto; y++) {
    const sy = Math.min(fuente.height - 1, Math.max(0, (y + 0.5) * f - 0.5));
    const ya = Math.floor(sy);
    const yb = Math.min(fuente.height - 1, ya + 1);
    for (let x = 0; x < ancho; x++) {
      const sx = Math.min(fuente.width - 1, Math.max(0, (x + 0.5) * f - 0.5));
      const xa = Math.floor(sx);
      const xb = Math.min(fuente.width - 1, xa + 1);
      for (let k = 0; k < 4; k++) {
        const v = (yy: number, xx: number): number => fuente.data[(yy * fuente.width + xx) * 4 + k] as number;
        const a = v(ya, xa) * (1 - (sx - xa)) + v(ya, xb) * (sx - xa);
        const b = v(yb, xa) * (1 - (sx - xa)) + v(yb, xb) * (sx - xa);
        destino.data[((y0 + y) * destino.width + x0 + x) * 4 + k] = a * (1 - (sy - ya)) + b * (sy - ya);
      }
    }
  }
}
