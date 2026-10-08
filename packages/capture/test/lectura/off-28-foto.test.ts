// OFF-28 (a) Foto de alta resolución para el frame de lectura (pwa-lectura-offline): `ImageCapture.takePhoto` con la
// máxima resolución de `getPhotoCapabilities`, límite de tiempo y respaldo al frame del vídeo. Entorno inyectado.
import { describe, expect, it, vi } from "vitest";
import { tomarFoto, type EntornoFoto } from "../../src/navegador/foto.js";

const PISTA = {} as MediaStreamTrack;
const BLOB = { size: 3 } as Blob;

function entorno(ic: Record<string, unknown> | null, extra: Partial<EntornoFoto> = {}) {
  const usos: unknown[] = [];
  const aPixeles = vi.fn(async (_b: Blob, ladoMax: number) => ({ ancho: 40, alto: 30, pixeles: new Uint8ClampedArray(40 * 30 * 4), ladoMax }));
  const e: EntornoFoto = {
    ...(ic === null
      ? {}
      : {
          ImageCapture: function ImageCapture(this: unknown, pista: MediaStreamTrack) {
            usos.push(pista);
            return ic;
          } as unknown as NonNullable<EntornoFoto["ImageCapture"]>,
        }),
    aPixeles,
    ...extra,
  };
  return { e, usos, aPixeles };
}

describe("OFF-28 Foto de alta resolución", () => {
  it("OFF-28 takePhoto con la máxima resolución de getPhotoCapabilities", async () => {
    const takePhoto = vi.fn(async () => BLOB);
    const { e, usos, aPixeles } = entorno({
      takePhoto,
      getPhotoCapabilities: async () => ({ imageWidth: { min: 160, max: 4000, step: 1 }, imageHeight: { min: 120, max: 3000, step: 1 } }),
    });
    const f = await tomarFoto(PISTA, e);
    expect(usos).toStrictEqual([PISTA]);
    expect(takePhoto).toHaveBeenCalledWith({ imageWidth: 4000, imageHeight: 3000 });
    expect(aPixeles).toHaveBeenCalledWith(BLOB, 4096);
    expect(f).toMatchObject({ origen: "takePhoto", ancho: 40, alto: 30 });
  });

  it("OFF-28 sin capacidades: takePhoto sin ajustes", async () => {
    const takePhoto = vi.fn(async () => BLOB);
    const { e } = entorno({ takePhoto, getPhotoCapabilities: async () => Promise.reject(new Error("no")) });
    expect(await tomarFoto(PISTA, e)).toMatchObject({ origen: "takePhoto" });
    expect(takePhoto).toHaveBeenCalledWith(undefined);
  });

  it("OFF-28 takePhoto rechaza, no existe o no hay ImageCapture: null (se usa el vídeo)", async () => {
    expect(await tomarFoto(PISTA, entorno({ takePhoto: async () => Promise.reject(new Error("x")) }).e)).toBeNull();
    expect(await tomarFoto(PISTA, entorno({}).e)).toBeNull();
    expect(await tomarFoto(PISTA, entorno(null).e)).toBeNull();
    const lanza = entorno(null, { ImageCapture: function () { throw new Error("pista"); } as unknown as NonNullable<EntornoFoto["ImageCapture"]> });
    expect(await tomarFoto(PISTA, lanza.e)).toBeNull();
    const malDecodificada = entorno({ takePhoto: async () => BLOB }, { aPixeles: async () => Promise.reject(new Error("decodificar")) });
    expect(await tomarFoto(PISTA, malDecodificada.e)).toBeNull();
  });

  it("OFF-28 límite de 3000 ms", async () => {
    vi.useFakeTimers();
    try {
      const { e, aPixeles } = entorno({ takePhoto: () => new Promise(() => undefined) });
      const promesa = tomarFoto(PISTA, e);
      await vi.advanceTimersByTimeAsync(2999);
      let hecho = false;
      void promesa.then(() => (hecho = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(hecho).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await promesa).toBeNull();
      expect(aPixeles).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
