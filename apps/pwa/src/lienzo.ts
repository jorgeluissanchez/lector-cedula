/**
 * Lienzo temporal para analizar un frame completo (CAM-11, OFF-11; hallazgo del revisor de privacidad): dibuja el
 * frame en un OffscreenCanvas, ejecuta el análisis y, en todas las ramas, lo borra y lo reduce a 1x1 para que no quede
 * ninguna copia del frame.
 */
export interface FrameRgba {
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: Uint8ClampedArray;
}

export async function conLienzoTemporal<T>(frame: FrameRgba, analizar: (lienzo: OffscreenCanvas) => Promise<T>): Promise<T> {
  const lienzo = new OffscreenCanvas(frame.ancho, frame.alto);
  const ctx = lienzo.getContext("2d") as OffscreenCanvasRenderingContext2D;
  try {
    // Sin copia: el ImageData comparte el buffer del frame, que quien llama pone a cero.
    ctx.putImageData(new ImageData(frame.pixeles as Uint8ClampedArray<ArrayBuffer>, frame.ancho, frame.alto), 0, 0);
    return await analizar(lienzo);
  } finally {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    lienzo.width = 1;
    lienzo.height = 1;
  }
}
