/**
 * Copias de píxeles a cero (SDK-44, "Copias a cero"). `copiaEnvio` guarda la copia de la imagen del envío y la pone a
 * cero al liberarla (idempotente); `conCeroAnteError` pone a cero todos los búferes vistos si la captura lanza.
 */
export interface PixelesCopia {
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: Uint8ClampedArray;
  liberar(): void;
}

export function copiaEnvio(f: { ancho: number; alto: number; pixeles: Uint8ClampedArray }): PixelesCopia {
  const pixeles = new Uint8ClampedArray(f.pixeles);
  return { ancho: f.ancho, alto: f.alto, pixeles, liberar: () => void pixeles.fill(0) };
}

export async function conCeroAnteError<T>(bufers: readonly Uint8ClampedArray[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    for (const b of bufers) b.fill(0);
    throw e;
  }
}
