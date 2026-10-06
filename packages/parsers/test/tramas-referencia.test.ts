// fixture-sintetico: pruebas del ayudante de tramas de referencia (personas ficticias, NUIP 9999...).
import { describe, expect, it } from "vitest";
import {
  C,
  C_F,
  P1,
  P2,
  P3,
  P4,
  P5,
  P8,
  S,
  W,
  W_F,
  byteCola,
  inicioColaC,
  latin1,
} from "./ayudas/tramas-referencia.js";

/** `PubDSK_1` como bytes literales (spec, convenciones). */
const MARCADOR = [0x50, 0x75, 0x62, 0x44, 0x53, 0x4b, 0x5f, 0x31];

function texto(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function posicionMarcador(trama: Uint8Array): number {
  for (let i = 0; i + MARCADOR.length <= trama.length; i++) {
    if (MARCADOR.every((b, j) => trama[i + j] === b)) return i;
  }
  return -1;
}

describe("Convenciones de PA-01 a PA-21: tramas de referencia", () => {
  it("C(P1) mide 531 bytes con la cabecera literal de la spec", () => {
    const c = C(P1);
    expect(c.length).toBe(531);
    expect(texto(c.subarray(0, 2))).toBe("01");
    expect(texto(c.subarray(2, 10))).toBe("99998888");
    expect([...c.subarray(10, 24)]).toStrictEqual(new Array<number>(14).fill(0));
    expect([...c.subarray(24, 32)]).toStrictEqual(MARCADOR);
    expect([...c.subarray(32, 40)]).toStrictEqual(new Array<number>(8).fill(0));
    expect(texto(c.subarray(40, 48))).toBe("99997777");
    expect(texto(c.subarray(48, 58))).toBe("9999123456");
  });

  it("C(P1) tiene los nombres con relleno 0x00 en rangos de 23 bytes y el bloque desde 150", () => {
    const c = C(P1);
    expect(texto(c.subarray(58, 81))).toBe("PEREZ" + "\0".repeat(18));
    expect(texto(c.subarray(81, 104))).toBe("GOMEZ" + "\0".repeat(18));
    expect(texto(c.subarray(104, 127))).toBe("JUAN" + "\0".repeat(19));
    expect(texto(c.subarray(127, 150))).toBe("CARLOS" + "\0".repeat(17));
    expect(texto(c.subarray(150, 168))).toBe("0M20000229160010O+");
    expect(inicioColaC(P1)).toBe(168);
  });

  it("la cola de C(P1) sigue (i * 73 + 41) mod 256 hasta 531", () => {
    const c = C(P1);
    expect(c[168]).toBe(0x11);
    expect(c[169]).toBe(0x5a);
    expect(c[530]).toBe(0x4b);
    for (let i = 168; i < 531; i++) expect(c[i]).toBe((i * 73 + 41) % 256);
    expect(byteCola(168)).toBe(17);
  });

  it("C(P2) codifica la Ñ como 0xD1 en el byte 60, É como 0xC9 y Á como 0xC1", () => {
    const c = C(P2);
    expect(c[60]).toBe(0xd1);
    expect([...c.subarray(58, 62)]).toStrictEqual([0x50, 0x45, 0xd1, 0x41]);
    expect([...c.subarray(104, 108)]).toStrictEqual([0x4a, 0x4f, 0x53, 0xc9]);
    expect([...c.subarray(127, 132)]).toStrictEqual([0xc1, 0x4e, 0x47, 0x45, 0x4c]);
    expect(texto(c.subarray(150, 169))).toBe("0M19851231010010AB-");
  });

  it("C(P5) empieza el primer apellido con Ñ y C(P8) llena su segundo apellido sin relleno", () => {
    expect(C(P5)[58]).toBe(0xd1);
    expect(texto(C(P8).subarray(81, 104))).toBe("ABCDEFGHIJKLMNOPQRSTUVW");
    expect(texto(C(P8).subarray(104, 108))).toBe("JUAN");
  });

  it("C(P3) y C(P4) tienen el bloque y los nombres compuestos de la spec", () => {
    expect(texto(C(P3).subarray(150, 169))).toBe("0F19700101310190AB+");
    expect(texto(C(P4).subarray(58, 68))).toBe("DE LA OSSA");
  });

  it("W(P1) mide 520 con el marcador en el byte 13", () => {
    const w = W(P1);
    expect(w.length).toBe(520);
    expect(posicionMarcador(w)).toBe(13);
    expect([...w.subarray(10, 13)]).toStrictEqual([0, 0, 0]);
    expect(texto(w.subarray(37, 47))).toBe("9999123456");
    expect(w[w.length - 1]).toBe(0x4b);
  });

  it("S(P1) mide 531 sin marcador y desplaza los campos +1 desde el byte 32", () => {
    const s = S(P1);
    expect(s.length).toBe(531);
    expect(posicionMarcador(s)).toBe(-1);
    expect([...s.subarray(10, 41)]).toStrictEqual(new Array<number>(31).fill(0));
    expect(texto(s.subarray(41, 49))).toBe("99997777");
    expect(texto(s.subarray(49, 59))).toBe("9999123456");
    expect(texto(s.subarray(151, 169))).toBe("0M20000229160010O+");
    expect(s[530]).toBe(C(P1)[529]);
  });

  it("el bloque de C_F(P1) es 0220000229M160010O+ y la cola sigue la fórmula", () => {
    const cf = C_F(P1);
    expect(cf.length).toBe(531);
    expect(texto(cf.subarray(150, 169))).toBe("0220000229M160010O+");
    expect(cf[169]).toBe(0x5a);
  });

  it("W_F(P3) es la truncada de C_F(P3)", () => {
    const wf = W_F(P3);
    expect(wf.length).toBe(520);
    expect(texto(wf.subarray(139, 159))).toBe("0219700101F310190AB+");
  });

  it("latin1 rechaza caracteres fuera de un byte", () => {
    expect(latin1("PE" + String.fromCharCode(0xd1) + "A")).toStrictEqual([0x50, 0x45, 0xd1, 0x41]);
    expect(() => latin1(String.fromCharCode(0x20ac))).toThrow();
  });
});
