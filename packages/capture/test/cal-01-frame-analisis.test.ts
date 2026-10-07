import { describe, expect, it } from "vitest";
import { luminancia, luminanciasFrame } from "../src/calidad/luminancia.js";
import { dimensionesAnalisis } from "../src/calidad/reduccion.js";

describe("CAL-01 Frame de análisis", () => {
  it("CAL-01 Dimensiones del frame de análisis", () => {
    const entradas = [[1920, 1080], [1280, 720], [1080, 1920], [3840, 2160], [1440, 1080], [640, 480], [320, 240], [1000, 1000]] as const;
    expect(entradas.map(([w, h]) => dimensionesAnalisis(w, h))).toStrictEqual([
      { ancho: 640, alto: 360 },
      { ancho: 640, alto: 360 },
      { ancho: 360, alto: 640 },
      { ancho: 640, alto: 360 },
      { ancho: 640, alto: 480 },
      { ancho: 640, alto: 480 },
      { ancho: 320, alto: 240 },
      { ancho: 640, alto: 640 },
    ]);
  });

  it("CAL-01 Luminancia de colores puros", () => {
    const colores = [[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [250, 250, 250], [249, 249, 249]] as const;
    expect(colores.map(([r, g, b]) => luminancia(r, g, b))).toStrictEqual([255, 0, 77, 149, 29, 250, 249]);
  });

  it("CAL-01 Luminancia de grises", () => {
    const obtenidos = Array.from({ length: 256 }, (_, v) => luminancia(v, v, v));
    expect(obtenidos).toStrictEqual(Array.from({ length: 256 }, (_, v) => v));
  });

  it("CAL-01 Luminancia por píxel de un frame RGBA (ignora alfa)", () => {
    const pixeles = new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 17]);
    expect(Array.from(luminanciasFrame(pixeles, 3, 1))).toStrictEqual([77, 149, 29]);
  });

  it("CAL-01 Un frame menor que 640 px y de lado largo vertical conserva la proporción redondeada", () => {
    expect(dimensionesAnalisis(1081, 1921)).toStrictEqual({ ancho: 360, alto: 640 });
    expect(dimensionesAnalisis(1, 1)).toStrictEqual({ ancho: 1, alto: 1 });
    expect(dimensionesAnalisis(641, 1)).toStrictEqual({ ancho: 640, alto: 1 });
  });
});
