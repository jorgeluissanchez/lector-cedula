// Cambio otros-documentos: propiedades de OD-02 (round-trip y mutación de un carácter protegido), OD-05 y OD-10
// (nunca lanza) y regresión de la digital (OD-10a). numRuns >= 1000.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clasificarDocumento, parsearMrzCedulaDigital, parsearMrzTd1, parsearMrzTd3 } from "../src/index.js";
import { arbDatosTd1, arbDatosTd3, generarTd1, generarTd3, isoNacimiento, isoVencimiento } from "./ayudas/generador-mrz-icao.js";

const REF = "2026-10-08";
const RUNS = { numRuns: 1000 };
const sinRelleno = (t: string): string | null => (t.replace(/<+$/, "") === "" ? null : t.replace(/<+$/, ""));

/** Posiciones protegidas por los dígitos de control en la línea 2 del TD3. */
const PROTEGIDAS_TD3 = [...Array(10).keys(), ...[13, 14, 15, 16, 17, 18, 19], ...[21, 22, 23, 24, 25, 26, 27], 43];

describe("OD-02 Propiedad de round-trip TD3", () => {
  it("el generador produce pasaportes que el parser devuelve igual", () => {
    let utiles = 0;
    fc.assert(
      fc.property(arbDatosTd3(), (d) => {
        const r = parsearMrzTd3(generarTd3(d), { fechaReferencia: REF });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        utiles++;
        expect(r.campos).toStrictEqual({
          codigoDocumento: "P",
          estadoEmisor: d.emisor,
          apellidos: d.apellidos,
          nombres: d.nombres,
          numeroDocumento: d.numero,
          nacionalidad: d.nacionalidad,
          fechaNacimiento: isoNacimiento(d.nacimiento, REF),
          sexo: d.sexo === "F" || d.sexo === "M" ? d.sexo : null,
          fechaVencimiento: isoVencimiento(d.vencimiento),
          datoOpcional: d.opcional === "" ? null : d.opcional,
        });
        expect(r.correcciones).toStrictEqual([]);
      }),
      RUNS,
    );
    expect(utiles).toBeGreaterThan(500);
  });

  it("alterar un carácter numérico protegido da ok: false", () => {
    fc.assert(
      fc.property(arbDatosTd3(), fc.constantFrom(...PROTEGIDAS_TD3), fc.integer({ min: 1, max: 9 }), (d, pos, delta) => {
        const [l1, l2] = generarTd3(d);
        const c = l2.charAt(pos);
        fc.pre(/[0-9]/.test(c));
        const nuevo = String((Number(c) + delta) % 10);
        const r = parsearMrzTd3([l1, l2.slice(0, pos) + nuevo + l2.slice(pos + 1)], { fechaReferencia: REF });
        expect(r.ok).toBe(false);
      }),
      RUNS,
    );
  });
});

describe("OD-10 Propiedad de round-trip TD1", () => {
  it("el generador produce TD1 que el parser devuelve igual", () => {
    fc.assert(
      fc.property(arbDatosTd1(), (d) => {
        const r = parsearMrzTd1(generarTd1(d), { fechaReferencia: REF });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.campos).toStrictEqual({
          codigoDocumento: d.codigo,
          estadoEmisor: d.emisor,
          numeroDocumento: d.numero,
          datoOpcional1: sinRelleno(d.opcional1),
          fechaNacimiento: isoNacimiento(d.nacimiento, REF),
          sexo: d.sexo === "F" || d.sexo === "M" ? d.sexo : null,
          fechaVencimiento: isoVencimiento(d.vencimiento),
          nacionalidad: d.nacionalidad,
          datoOpcional2: sinRelleno(d.opcional2),
          apellidos: d.apellidos,
          nombres: d.nombres,
        });
      }),
      RUNS,
    );
  });

  it("alterar un dígito protegido da ok: false", () => {
    const protegidas: [number, number][] = [
      ...[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((p): [number, number] => [0, p]),
      ...[0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 29].map((p): [number, number] => [1, p]),
    ];
    fc.assert(
      fc.property(arbDatosTd1(), fc.constantFrom(...protegidas), fc.integer({ min: 1, max: 9 }), (d, [linea, pos], delta) => {
        const lineas = generarTd1(d);
        const l = lineas[linea] as string;
        const c = l.charAt(pos);
        fc.pre(/[0-9]/.test(c));
        lineas[linea] = l.slice(0, pos) + String((Number(c) + delta) % 10) + l.slice(pos + 1);
        expect(parsearMrzTd1(lineas, { fechaReferencia: REF }).ok).toBe(false);
      }),
      RUNS,
    );
  });
});

describe("OD-05, OD-10 Nunca lanza", () => {
  const funciones = [parsearMrzTd3, parsearMrzTd1, clasificarDocumento];
  it("fc.anything()", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, o) => {
        for (const f of funciones) expect(typeof f(a, o).ok).toBe("boolean");
      }),
      RUNS,
    );
  });
  it("fc.string()", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        for (const f of funciones) expect(typeof f(s).ok).toBe("boolean");
      }),
      RUNS,
    );
  });
  it("pares y tríos binarios", () => {
    const bin = fc.string({ unit: "binary" });
    fc.assert(
      fc.property(fc.tuple(bin, bin), fc.tuple(bin, bin, bin), (par, trio) => {
        for (const f of funciones) {
          expect(typeof f(par, { fechaReferencia: REF }).ok).toBe("boolean");
          expect(typeof f(trio, { fechaReferencia: REF }).ok).toBe("boolean");
        }
      }),
      RUNS,
    );
  });
  it("líneas del alfabeto MRZ con la longitud correcta", () => {
    const linea = (n: number) => fc.string({ unit: fc.constantFrom(..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<<<<"), minLength: n, maxLength: n });
    fc.assert(
      fc.property(fc.tuple(linea(44), linea(44)), fc.tuple(linea(30), linea(30), linea(30)), (par, trio) => {
        expect(typeof parsearMrzTd3(["P<" + par[0].slice(2), par[1]], { fechaReferencia: REF }).ok).toBe("boolean");
        expect(typeof clasificarDocumento(trio, { fechaReferencia: REF }).ok).toBe("boolean");
      }),
      RUNS,
    );
  });
});

describe("OD-10a La digital no cambia", () => {
  it("parsearMrzTd1 no altera la salida de parsearMrzCedulaDigital", () => {
    fc.assert(
      fc.property(arbDatosTd1(), (d) => {
        const lineas = generarTd1({ ...d, codigo: "IC", emisor: "COL", nacionalidad: "COL" });
        const antes = parsearMrzCedulaDigital(lineas, { fechaReferencia: REF });
        parsearMrzTd1(lineas, { fechaReferencia: REF });
        clasificarDocumento(lineas, { fechaReferencia: REF });
        expect(parsearMrzCedulaDigital(lineas, { fechaReferencia: REF })).toStrictEqual(antes);
      }),
      { numRuns: 200 },
    );
  });
});
