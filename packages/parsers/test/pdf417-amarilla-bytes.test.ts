// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import {
  MARCADOR_PUBDSK,
  buscarMarcador,
  decodificarLatin1,
  esDigito,
  esLetra,
  hayMarcadorEn,
} from "../src/pdf417-amarilla/bytes.js";
import { clasificarTrama } from "../src/pdf417-amarilla/trama.js";
import { C, P1, S, W, nulos, sustituir } from "./ayudas/tramas-referencia.js";

/** Rangos literales de letras de PA-05 (oráculo independiente del código). */
const RANGOS_LETRA: [number, number][] = [
  [0x41, 0x5a],
  [0x61, 0x7a],
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0xff],
];
const MARCADOR = [0x50, 0x75, 0x62, 0x44, 0x53, 0x4b, 0x5f, 0x31];

function enRangos(b: number): boolean {
  return RANGOS_LETRA.some(([lo, hi]) => b >= lo && b <= hi);
}

function variante(bytes: Uint8Array): unknown {
  const r = parsearPdf417Amarilla(bytes);
  return r.ok ? r.trama.variante : r.error;
}

describe("PA-05 Clases de byte y decodificación ISO-8859-1 (bytes.ts)", () => {
  it("PA-05 Tabla de los 256 bytes contra los rangos literales de letras (atrapa: clase [A-Za-z] sin Ñ o con × y ÷)", () => {
    for (let b = 0; b < 256; b++) expect([b, esLetra(b)]).toStrictEqual([b, enRangos(b)]);
    expect(esLetra(0xd7)).toBe(false);
    expect(esLetra(0xf7)).toBe(false);
    expect(esLetra(0xd1)).toBe(true);
  });

  it("PA-05 Valores fuera de un byte no son letras ni dígitos (atrapa: leer más allá del final como letra)", () => {
    for (const v of [undefined, -1, 256, 0x130]) {
      expect(esLetra(v)).toBe(false);
      expect(esDigito(v)).toBe(false);
    }
  });

  it("PA-05 Dígitos ASCII 0x30 a 0x39 y nada más (atrapa: dígitos Unicode o bordes desplazados)", () => {
    for (let b = 0; b < 256; b++) expect([b, esDigito(b)]).toStrictEqual([b, b >= 0x30 && b <= 0x39]);
  });

  it("PA-05 0x80 no es letra ni se decodifica como el euro (atrapa: TextDecoder latin1 = windows-1252)", () => {
    expect(esLetra(0x80)).toBe(false);
    const texto = decodificarLatin1(Uint8Array.from([0x80, 0xd1, 0xc9, 0xc1]), 0, 4);
    expect([...texto].map((c) => c.charCodeAt(0))).toStrictEqual([0x80, 0xd1, 0xc9, 0xc1]);
    expect(texto).not.toContain(String.fromCharCode(0x20ac));
  });

  it("PA-05 Decodifica solo el rango pedido (atrapa: decodificar fuera de [inicio, fin))", () => {
    const bytes = Uint8Array.from([0x41, 0x50, 0x45, 0xd1, 0x41, 0x5a]);
    expect(decodificarLatin1(bytes, 1, 5)).toBe("PE" + String.fromCharCode(0xd1) + "A");
    expect(decodificarLatin1(bytes, 2, 2)).toBe("");
  });

  it("PA-06 El marcador se declara como bytes (atrapa: literal de texto en src/)", () => {
    expect([...MARCADOR_PUBDSK]).toStrictEqual(MARCADOR);
  });

  it("PA-06 hayMarcadorEn compara los 8 bytes (atrapa: comparar solo un prefijo)", () => {
    const c = C(P1);
    expect(hayMarcadorEn(c, 24)).toBe(true);
    expect(hayMarcadorEn(c, 23)).toBe(false);
    expect(hayMarcadorEn(c, 25)).toBe(false);
    for (let j = 0; j < 8; j++) expect(hayMarcadorEn(sustituir(c, 24 + j, [0x58]), 24)).toBe(false);
    expect(hayMarcadorEn(Uint8Array.from(MARCADOR.slice(0, 7)), 0)).toBe(false);
  });

  it("PA-06 buscarMarcador solo dentro del límite (atrapa: buscar en toda la trama)", () => {
    const base = new Uint8Array(100);
    expect(buscarMarcador(sustituir(base, 56, MARCADOR), 64)).toBe(56);
    expect(buscarMarcador(sustituir(base, 57, MARCADOR), 64)).toBe(-1);
    expect(buscarMarcador(sustituir(base, 0, MARCADOR), 64)).toBe(0);
    expect(buscarMarcador(base, 64)).toBe(-1);
    expect(buscarMarcador(Uint8Array.from(MARCADOR), 64)).toBe(0);
    expect(buscarMarcador(sustituir(sustituir(base, 30, MARCADOR), 5, MARCADOR), 64)).toBe(5);
  });
});

describe("PA-06 Clasificación de la trama (trama.ts)", () => {
  it("PA-06 Las tres variantes de referencia, por módulo (atrapa: confundir variantes)", () => {
    expect(clasificarTrama(C(P1))).toBe("completa");
    expect(clasificarTrama(W(P1))).toBe("truncada");
    expect(clasificarTrama(S(P1))).toBe("sin-pubdsk");
  });

  it("PA-06 Run de NUL en [10,24): 5 seguidos bastan y 4 no (atrapa: regla 'más de 4 NUL' mal acotada)", () => {
    const sinNul = sustituir(C(P1), 10, "XXXXXXXXXXXXXX");
    expect(clasificarTrama(sustituir(sinNul, 19, nulos(5)))).toBe("completa");
    expect(clasificarTrama(sustituir(sinNul, 10, nulos(5)))).toBe("completa");
    expect(clasificarTrama(sustituir(sinNul, 20, nulos(4)))).toBe("truncada");
    expect(clasificarTrama(sustituir(sustituir(sinNul, 10, nulos(4)), 15, nulos(4)))).toBe("truncada");
    expect(clasificarTrama(sustituir(C(P1), 9, [0]))).toBe("completa");
  });

  it("PA-06 Marcador en el byte 0 es truncada, no sin-pubdsk (atrapa: tratar la posición 0 como ausencia)", () => {
    expect(clasificarTrama(Uint8Array.from([...MARCADOR, ...nulos(40)]))).toBe("truncada");
  });

  it("PA-06 El run cuenta solo dentro de [10,24) (atrapa: contar NUL fuera de la cabecera)", () => {
    const c = sustituir(sustituir(C(P1), 2, nulos(8)), 10, "XXXXXXXXXXXXXX");
    expect(clasificarTrama(sustituir(c, 12, nulos(3)))).toBe("truncada");
  });

  it("PA-06 Las tres variantes de referencia (atrapa: confundir completa, truncada y sin PubDSK)", () => {
    expect([variante(C(P1)), variante(W(P1)), variante(S(P1))]).toStrictEqual(["completa", "truncada", "sin-pubdsk"]);
  });

  it("PA-06 Marcador en el byte 24 sin run de NUL (atrapa: clasificar solo por la posición del marcador)", () => {
    const r = parsearPdf417Amarilla(sustituir(C(P1), 10, "0000000000"));
    expect(r.ok && r.trama.variante).toBe("truncada");
    expect(r.ok && r.trama.modo).toBe("patrones");
  });

  it("PA-06 Marcador en la cola se ignora (atrapa: buscar el marcador en la biometría)", () => {
    const conMarcador = sustituir(S(P1), 200, MARCADOR);
    const r = parsearPdf417Amarilla(conMarcador);
    expect(r).toStrictEqual(parsearPdf417Amarilla(S(P1)));
    expect(r.ok && r.trama.variante).toBe("sin-pubdsk");
  });
});
