// Unitarias de forma de los generadores de escenas (tarea 2.1): dimensiones y píxeles de muestra.
import { describe, expect, it } from "vitest";
import {
  bloque,
  brillo,
  completo,
  desenfocar,
  desenfoqueCaja,
  disco,
  gris,
  rayas,
  rect,
  ruido,
  tablero,
  valor,
} from "./escenas.js";

describe("Escenas sintéticas de prueba", () => {
  it("gris: dimensiones, RGBA (v, v, v, 255)", () => {
    const e = gris(3, 2, 77);
    expect([e.ancho, e.alto, e.pixeles.length]).toStrictEqual([3, 2, 24]);
    expect(Array.from(e.pixeles.slice(20, 24))).toStrictEqual([77, 77, 77, 255]);
  });

  it("tablero: a en x + y par, b en impar", () => {
    const e = tablero(4, 4, 10, 200);
    expect([valor(e, 0, 0), valor(e, 1, 0), valor(e, 0, 1), valor(e, 3, 3), valor(e, 2, 3)]).toStrictEqual([10, 200, 200, 10, 200]);
  });

  it("rayas: a en columnas pares, b en impares", () => {
    const e = rayas(4, 3, 0, 255);
    expect([valor(e, 0, 0), valor(e, 1, 0), valor(e, 0, 2), valor(e, 3, 2)]).toStrictEqual([0, 255, 0, 255]);
  });

  it("bloque: rango inclusivo y no modifica la base", () => {
    const base = gris(10, 10, 128);
    const e = bloque(base, 255, 2, 4, 5, 6);
    expect([valor(e, 2, 5), valor(e, 4, 6), valor(e, 5, 6), valor(e, 1, 5), valor(e, 2, 7)]).toStrictEqual([255, 255, 128, 128, 128]);
    expect(valor(base, 2, 5)).toBe(128);
    let cuenta = 0;
    for (let i = 0; i < e.pixeles.length; i += 4) if (e.pixeles[i] === 255) cuenta++;
    expect(cuenta).toBe(6);
  });

  it("disco: centrado y con el área esperada", () => {
    const e = disco(gris(128, 128, 128), 255, 16);
    expect(valor(e, 64, 64)).toBe(255);
    expect(valor(e, 0, 0)).toBe(128);
    let cuenta = 0;
    for (let i = 0; i < e.pixeles.length; i += 4) if (e.pixeles[i] === 255) cuenta++;
    expect(Math.abs(cuenta - Math.PI * 256)).toBeLessThan(40);
  });

  it("ruido: determinista por semilla, distinto entre semillas, en 0..255", () => {
    const a = ruido(32, 32, 1);
    expect(ruido(32, 32, 1).pixeles).toStrictEqual(a.pixeles);
    expect(ruido(32, 32, 2).pixeles).not.toStrictEqual(a.pixeles);
    const grises = new Set<number>();
    for (let i = 0; i < a.pixeles.length; i += 4) grises.add(a.pixeles[i] ?? -1);
    expect(grises.size).toBeGreaterThan(200);
  });

  it("desenfoque de caja: borde replicado y redondeo al entero más cercano", () => {
    // Una columna 255 en x = 0 sobre 0: en (0, y) la ventana replicada tiene 6 de 9 a 255; en (1, y), 3 de 9.
    const e = bloque(gris(4, 3, 0), 255, 0, 0, 0, 2);
    const d = desenfoqueCaja(e);
    expect([valor(d, 0, 1), valor(d, 1, 1), valor(d, 2, 1), valor(d, 0, 0)]).toStrictEqual([170, 85, 0, 170]);
    expect(d.pixeles[3]).toBe(255);
    // 5 de 9 a 1 y el resto a 0: 0,555... redondea a 1.
    const t = desenfoqueCaja(tablero(3, 3, 1, 0));
    expect(valor(t, 1, 1)).toBe(1);
    expect(desenfocar(e, 0)).toBe(e);
  });

  it("brillo: multiplica con redondeo y satura en 255 sin tocar alfa", () => {
    const e = brillo(bloque(gris(2, 1, 100), 250, 1, 1, 0, 0), 1.2);
    expect(Array.from(e.pixeles)).toStrictEqual([120, 120, 120, 255, 255, 255, 255, 255]);
  });

  it("completo y rect", () => {
    expect(completo(64, 32)).toStrictEqual([[0, 0], [64, 0], [64, 32], [0, 32]]);
    expect(rect(1, 2, 3, 4)).toStrictEqual([[1, 2], [3, 2], [3, 4], [1, 4]]);
  });
});
