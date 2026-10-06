// fixture-sintetico: tramas de referencia ficticias (NUIP 9999..., AFIS 99998888, tarjeta 99997777) de la spec parser-pdf417-amarilla.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import { problemasDeForma } from "./ayudas/forma-resultado.js";
import {
  C,
  C_F,
  P1,
  P2,
  P3,
  P4,
  P5,
  P6,
  P7,
  P8,
  S,
  S_F,
  W,
  W_F,
  cambiarCola,
  inicioColaC,
  latin1,
  nulos,
  sustituir,
} from "./ayudas/tramas-referencia.js";

function claves(o: object): string[] {
  return Object.keys(o).sort();
}

describe("PA-16 Descarte de biometría y datos de control", () => {
  it("PA-16 La cola no cambia el resultado (atrapa: leer bytes posteriores al signo del RH)", () => {
    const c = C(P1);
    const inicio = inicioColaC(P1);
    expect(inicio).toBe(168);
    const referencia = parsearPdf417Amarilla(c);
    const colas = [new Array<number>(363).fill(0xff), nulos(363), [], latin1("0M19990101160010AB+PEREZ")];
    for (const cola of colas) expect(parsearPdf417Amarilla(cambiarCola(c, inicio, cola))).toStrictEqual(referencia);
  });

  it("PA-16 La cola no cambia el resultado en las tramas truncada, sin PubDSK y fecha primero (atrapa: leer la cola en patrones)", () => {
    const casos: [Uint8Array, number][] = [
      [W(P3), 158],
      [S(P3), 170],
      [C_F(P3), 170],
      [W_F(P1), 158],
      [S_F(P2), 171],
    ];
    for (const [trama, inicio] of casos) {
      const referencia = parsearPdf417Amarilla(trama);
      expect(referencia.ok).toBe(true);
      expect(parsearPdf417Amarilla(trama.subarray(0, inicio))).toStrictEqual(referencia);
      expect(parsearPdf417Amarilla(cambiarCola(trama, inicio, latin1("+-AB0M20000229")))).toStrictEqual(referencia);
    }
  });

  it("PA-16 Datos de control ausentes del resultado (atrapa: devolver AFIS, tarjeta o marcador)", () => {
    for (const trama of [C(P1), W(P1), S(P1)]) {
      const texto = JSON.stringify(parsearPdf417Amarilla(trama));
      for (const prohibido of ["99998888", "99997777", "PubDSK"]) expect([prohibido, texto.includes(prohibido)]).toStrictEqual([prohibido, false]);
    }
  });
});

describe("PA-03 Resultado de error y prioridad de motivos", () => {
  it("PA-03 Un ejemplo por cada motivo de interpretación (atrapa: motivo de una etapa posterior o claves extra)", () => {
    const tramas = [
      new Uint8Array(531),
      sustituir(C(P1), 48, "0000000000"),
      sustituir(C(P1), 61, [0x2e]),
      sustituir(C(P1), 81, nulos(69)),
      sustituir(C(P1), 151, "X"),
      sustituir(C(P1), 152, "20000230"),
    ];
    const resultados = tramas.map((t) => parsearPdf417Amarilla(t));
    expect(resultados).toStrictEqual([
      { ok: false, error: "nuip-no-encontrado" },
      { ok: false, error: "nuip-invalido" },
      { ok: false, error: "caracteres-invalidos-en-nombre" },
      { ok: false, error: "nombres-no-reconocidos" },
      { ok: false, error: "bloque-demografico-no-encontrado" },
      { ok: false, error: "fecha-nacimiento-invalida" },
    ]);
    for (const r of resultados) expect(claves(r)).toStrictEqual(["error", "ok"]);
  });
});

describe("PA-02 y PA-04 Pureza y datos planos", { timeout: 60_000 }, () => {
  it("PA-02 Solo datos planos (atrapa: devolver vistas, buffers o funciones)", () => {
    const r = parsearPdf417Amarilla(C(P2));
    expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
    const pila: unknown[] = [r];
    while (pila.length > 0) {
      const v = pila.pop();
      expect(v instanceof Uint8Array || v instanceof ArrayBuffer || typeof v === "function").toBe(false);
      if (typeof v === "object" && v !== null) {
        expect([Object.prototype, Array.prototype]).toContain(Object.getPrototypeOf(v));
        pila.push(...Object.values(v));
      }
    }
  });

  it("PA-04 Determinismo y entrada intacta (atrapa: estado entre llamadas o escritura sobre la entrada)", () => {
    const copia = W(P2);
    const duplicado = Uint8Array.from(copia);
    const primero = parsearPdf417Amarilla(copia);
    const segundo = parsearPdf417Amarilla(copia);
    expect(primero).toStrictEqual(segundo);
    expect(copia).toStrictEqual(duplicado);
    expect(primero.ok).toBe(true);
  });

  it("PA-04 Nunca lanza con bytes arbitrarios (atrapa: excepciones o formas fuera de PA-02 y PA-03)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2048 }), (bytes) => {
        const r = parsearPdf417Amarilla(bytes);
        expect(problemasDeForma(r)).toStrictEqual([]);
      }),
      { numRuns: 1000 },
    );
  });

  it("PA-04 Tramas de referencia con 1 a 3 bytes sustituidos cumplen las invariantes por campo (atrapa: datos inventados con tramas corruptas)", () => {
    const bases = [P1, P2, P3, P4, P5, P6, P7, P8].flatMap((p) => [C(p), W(p), S(p), C_F(p)]);
    const sustitucion = fc.record({ posicion: fc.integer({ min: 0, max: 200 }), valor: fc.integer({ min: 0, max: 255 }) });
    let exitos = 0;
    let errores = 0;
    fc.assert(
      fc.property(fc.constantFrom(...bases), fc.array(sustitucion, { minLength: 1, maxLength: 3 }), (base, cambios) => {
        let trama = base;
        for (const { posicion, valor } of cambios) trama = sustituir(trama, posicion, [valor]);
        const original = Uint8Array.from(trama);
        const r = parsearPdf417Amarilla(trama);
        expect(problemasDeForma(r)).toStrictEqual([]);
        expect(parsearPdf417Amarilla(trama)).toStrictEqual(r);
        expect(Buffer.compare(trama, original)).toBe(0);
        if (r.ok) exitos++;
        else errores++;
      }),
      { numRuns: 1000 },
    );
    expect(exitos / (exitos + errores)).toBeGreaterThan(0.5);
    expect(errores / (exitos + errores)).toBeGreaterThanOrEqual(0.05);
  });
});
