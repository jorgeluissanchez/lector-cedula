// Cambio demo-opciones, DOP-04 y DOP-05 (tarea 1.2): valores efectivos de la TI y de la señal de fraude. Tablas
// literales de la spec (8 combinaciones cada una).
import { describe, expect, it } from "vitest";
import { fraudeEfectivo, tiDisponible, tiEfectiva } from "../src/opciones";

const B = [false, true] as const;

describe("DOP-04 Tarjeta de identidad desde el panel", () => {
  it("DOP-04 Tabla de la TI efectiva", () => {
    const tabla = B.flatMap((compilacion) => B.flatMap((demo) => B.map((preferencia) => [compilacion, demo, preferencia, tiEfectiva({ compilacion, demo, preferencia })])));
    expect(tabla).toStrictEqual([
      [false, false, false, false],
      [false, false, true, false],
      [false, true, false, false],
      [false, true, true, true],
      [true, false, false, true],
      [true, false, true, true],
      [true, true, false, true],
      [true, true, true, true],
    ]);
  });

  it("DOP-04 tiDisponible es false solo sin TI de compilación ni demo", () => {
    expect([tiDisponible(false, false), tiDisponible(false, true), tiDisponible(true, false), tiDisponible(true, true)]).toStrictEqual([false, true, true, true]);
  });
});

describe("DOP-05 Señal de fraude desde el panel", () => {
  it("DOP-05 Tabla del fraude efectivo", () => {
    const tabla = B.flatMap((forzado) => B.flatMap((demo) => B.map((preferencia) => [forzado, demo, preferencia, fraudeEfectivo({ forzado, demo, preferencia })])));
    expect(tabla).toStrictEqual([
      [false, false, false, false],
      [false, false, true, false],
      [false, true, false, false],
      [false, true, true, true],
      [true, false, false, true],
      [true, false, true, true],
      [true, true, false, true],
      [true, true, true, true],
    ]);
  });
});
