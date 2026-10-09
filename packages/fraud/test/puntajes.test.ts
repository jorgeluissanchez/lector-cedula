// FRA-07 a FRA-10 (cambio deteccion-fraude): conversión de medidas a motivos con medidas literales.
import { describe, expect, it } from "vitest";
import type { MedidasImagen } from "../src/detectores/imagen.js";
import { ASPECTO_ID1, puntajeEdicion, puntajeFotocopia, puntajePantalla, puntajeRecorte, rampa } from "../src/detectores/puntajes.js";

const N: MedidasImagen = {
  subpixeles: 10,
  frecuenciaSubpixeles: 50,
  reflejo: 0,
  luzExterior: 110,
  banding: 0,
  saturacion: 0.45,
  texturaPlana: 1.2,
  holograma: 60,
  aspecto: ASPECTO_ID1,
  esquinasRectas: 0,
  esquinasDecidibles: 4,
  dobleCompresion: 1,
  superposicion: 0,
};

describe("rampa", () => {
  it("ascendente, descendente y saturada", () => {
    expect([0, 5, 10, 20].map((x) => rampa(x, 5, 15))).toStrictEqual([0, 0, 0.5, 1]);
    expect([0, 10, 20].map((x) => rampa(x, 15, 5))).toStrictEqual([1, 0.5, 0]);
  });
});

describe("FRA-07 pantalla", () => {
  it("auténtico: sin motivo", () => {
    expect(puntajePantalla(N)).toBeNull();
  });
  it("pico periódico aliasado: moire 0,9", () => {
    expect(puntajePantalla({ ...N, subpixeles: 150 })).toStrictEqual({ codigo: "pantalla", puntaje: 0.9, detalle: "moire" });
    expect(puntajePantalla({ ...N, subpixeles: 115 })).toStrictEqual({ codigo: "pantalla", puntaje: 0.45, detalle: "moire" });
  });
  it("rejilla resuelta: subpixeles", () => {
    expect(puntajePantalla({ ...N, subpixeles: 200, frecuenciaSubpixeles: 90 })?.detalle).toBe("subpixeles");
    expect(puntajePantalla({ ...N, subpixeles: 200, frecuenciaSubpixeles: 85 })?.detalle).toBe("moire");
  });
  it("banding domina a la rejilla y se combina con OR probabilístico", () => {
    expect(puntajePantalla({ ...N, subpixeles: 200, banding: 60 })).toStrictEqual({ codigo: "pantalla", puntaje: 0.995, detalle: "banding" });
    expect(puntajePantalla({ ...N, banding: 40 })).toStrictEqual({ codigo: "pantalla", puntaje: 0.475, detalle: "banding" });
  });
  it("marco y reflejo solos son señales débiles", () => {
    expect(puntajePantalla({ ...N, luzExterior: 30 })).toStrictEqual({ codigo: "pantalla", puntaje: 0.35, detalle: "marco-pantalla" });
    expect(puntajePantalla({ ...N, reflejo: 0.2 })).toStrictEqual({ codigo: "pantalla", puntaje: 0.25, detalle: "reflejo-plano" });
    expect(puntajePantalla({ ...N, luzExterior: 30, reflejo: 0.2 })?.puntaje).toBe(0.513);
  });
});

describe("FRA-08 fotocopia", () => {
  it("auténtica amarilla: sin motivo", () => {
    expect(puntajeFotocopia(N, "amarilla", 0)).toBeNull();
  });
  it("gris", () => {
    expect(puntajeFotocopia({ ...N, saturacion: 0.02 }, "amarilla", 0)).toMatchObject({ detalle: "gris" });
    expect(puntajeFotocopia({ ...N, saturacion: 0.02 }, "amarilla", 0)?.puntaje).toBe(0.985);
  });
  it("baja saturación según el tipo", () => {
    expect(puntajeFotocopia({ ...N, saturacion: 0.23 }, "amarilla", 0)).toStrictEqual({ codigo: "fotocopia", puntaje: 0.7, detalle: "baja-saturacion" });
    expect(puntajeFotocopia({ ...N, saturacion: 0.12 }, "digital", 0)).toBeNull();
    expect(puntajeFotocopia({ ...N, saturacion: 0.06 }, "digital", 0)?.detalle).toBe("baja-saturacion");
  });
  it("tramado y papel; anulados si hay pantalla", () => {
    expect(puntajeFotocopia({ ...N, texturaPlana: 18 }, "amarilla", 0)?.detalle).toBe("tramado");
    expect(puntajeFotocopia({ ...N, texturaPlana: 2.8 }, "amarilla", 0)).toStrictEqual({ codigo: "fotocopia", puntaje: 0.5, detalle: "papel" });
    expect(puntajeFotocopia({ ...N, texturaPlana: 18 }, "amarilla", 0.6)).toBeNull();
    expect(puntajeFotocopia({ ...N, texturaPlana: 18 }, "amarilla", 0.45)?.puntaje).toBe(0.569);
  });
  it("sin holograma: solo con medida", () => {
    expect(puntajeFotocopia({ ...N, holograma: 1 }, "amarilla", 0)).toStrictEqual({ codigo: "fotocopia", puntaje: 0.6, detalle: "sin-holograma" });
    expect(puntajeFotocopia({ ...N, holograma: null }, "amarilla", 0)).toBeNull();
    expect(puntajeFotocopia({ ...N, holograma: 10 }, "amarilla", 0)).toBeNull();
  });
});

describe("FRA-09 recorte", () => {
  it("ID-1 redondeada: sin motivo", () => {
    expect(puntajeRecorte(N)).toBeNull();
    expect(puntajeRecorte({ ...N, aspecto: ASPECTO_ID1 + 0.029 })).toBeNull();
  });
  it("aspecto fuera de tolerancia", () => {
    expect(puntajeRecorte({ ...N, aspecto: 1000 / 700 })).toStrictEqual({ codigo: "recorte", puntaje: 1, detalle: "aspecto" });
    expect(puntajeRecorte({ ...N, aspecto: ASPECTO_ID1 + 0.055 })?.puntaje).toBeCloseTo(0.5, 2);
  });
  it("esquinas rectas: 3 o 4 dan 1, 2 dan 0,5, con al menos 3 decidibles", () => {
    expect(puntajeRecorte({ ...N, esquinasRectas: 4 })).toStrictEqual({ codigo: "recorte", puntaje: 1, detalle: "esquinas-rectas" });
    expect(puntajeRecorte({ ...N, esquinasRectas: 3, esquinasDecidibles: 3 })?.puntaje).toBe(1);
    expect(puntajeRecorte({ ...N, esquinasRectas: 2 })?.puntaje).toBe(0.5);
    expect(puntajeRecorte({ ...N, esquinasRectas: 1 })).toBeNull();
    expect(puntajeRecorte({ ...N, esquinasRectas: 2, esquinasDecidibles: 2 })).toBeNull();
  });
});

describe("FRA-10 edición", () => {
  it("doble compresión por tamaño del grupo de bloques", () => {
    expect(puntajeEdicion(N)).toBeNull();
    expect(puntajeEdicion({ ...N, dobleCompresion: 4 })).toBeNull();
    expect(puntajeEdicion({ ...N, dobleCompresion: 8 })).toStrictEqual({ codigo: "edicion", puntaje: 0.5, detalle: "doble-compresion" });
    expect(puntajeEdicion({ ...N, dobleCompresion: 30 })?.puntaje).toBe(1);
  });
  it("superposición por grupo rectangular de bloques sin ruido coherente", () => {
    expect(puntajeEdicion({ ...N, superposicion: 6 })).toBeNull();
    expect(puntajeEdicion({ ...N, superposicion: 14 })).toStrictEqual({ codigo: "edicion", puntaje: 0.5, detalle: "superposicion" });
    expect(puntajeEdicion({ ...N, superposicion: 22 })).toStrictEqual({ codigo: "edicion", puntaje: 1, detalle: "superposicion" });
    expect(puntajeEdicion({ ...N, superposicion: 22, dobleCompresion: 30 })?.detalle).toBe("doble-compresion");
  });
});

describe("bordes de puntajes (mutación)", () => {
  it("frecuencia exactamente en el límite de rejilla resuelta es subpixeles", () => {
    expect(puntajePantalla({ ...N, subpixeles: 200, frecuenciaSubpixeles: 256 / 3 })?.detalle).toBe("subpixeles");
  });
  it("banding null no aporta", () => {
    expect(puntajePantalla({ ...N, banding: null })).toBeNull();
  });
  it("relación ID-1 es 85,60/53,98 y una desviación exacta de la tolerancia no es motivo", () => {
    expect(ASPECTO_ID1).toBeCloseTo(1.5858, 4);
    expect(puntajeRecorte({ ...N, aspecto: ASPECTO_ID1 - 0.02 })).toBeNull();
  });
});
