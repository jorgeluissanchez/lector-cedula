// FRA-14 y FRA-15 (cambio deteccion-fraude, tarea 2.2): métricas ISO/IEC 30107-3, regresión y esquema del reporte.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  apcer,
  auc,
  bpcer,
  bpcerAApcer,
  compararConBaseline,
  metricasPorDocumento,
  validarReporteCampo,
  wilson,
} from "../runners/fraude/metricas-fraude.mjs";

const puntajes = (n, valor) => Array.from({ length: n }, () => valor);

describe("FRA-14 métricas", () => {
  it("FRA-14 cálculo literal: 100 ataques con 7 aceptados y 200 auténticos con 6 rechazados", () => {
    const ataques = [...puntajes(7, 10), ...puntajes(93, 90)];
    const autenticos = [...puntajes(6, 90), ...puntajes(194, 10)];
    expect(apcer(ataques, 40)).toBe(0.07);
    expect(bpcer(autenticos, 40)).toBe(0.03);
  });

  it("FRA-14 bordes del umbral: igual al umbral es ataque", () => {
    expect(apcer([40, 39], 40)).toBe(0.5);
    expect(bpcer([40, 39], 40)).toBe(0.5);
    expect(apcer([], 40)).toBe(0);
    expect(bpcer([], 40)).toBe(0);
  });

  it("FRA-14 Wilson 95 % (oráculo publicado: 7/100 -> [0,0343; 0,1375])", () => {
    const [a, b] = wilson(7, 100);
    expect(a).toBeCloseTo(0.0343, 3);
    expect(b).toBeCloseTo(0.1375, 3);
    expect(wilson(0, 0)).toStrictEqual([0, 1]);
    const [c, d] = wilson(0, 10);
    expect(c).toBe(0);
    expect(d).toBeCloseTo(0.2775, 3);
  });

  it("FRA-14 AUC: separación perfecta 1, invertida 0, empates 0,5", () => {
    expect(auc([90, 80], [10, 20])).toBe(1);
    expect(auc([10], [90])).toBe(0);
    expect(auc([50, 50], [50])).toBe(0.5);
    expect(auc([90, 10], [50])).toBe(0.5);
  });

  it("FRA-14 BPCER a APCER 5 %: umbral más alto con APCER máximo <= 5 %", () => {
    const especies = { pantalla: [...puntajes(95, 80), ...puntajes(5, 30)], recortada: puntajes(100, 60) };
    // Con umbral 60 la APCER máxima es 5 % (pantalla) y 0 % (recortada); con 61 recortada sube a 100 %.
    const autenticos = [...puntajes(90, 10), ...puntajes(10, 60)];
    expect(bpcerAApcer(especies, autenticos, 0.05)).toBe(0.1);
  });

  it("FRA-14 métricas por documento y especie", () => {
    const filas = [
      { tipo: "amarilla", clase: "autentica", puntaje: 0 },
      { tipo: "amarilla", clase: "autentica", puntaje: 50 },
      { tipo: "amarilla", clase: "pantalla", puntaje: 90 },
      { tipo: "amarilla", clase: "pantalla", puntaje: 10 },
      { tipo: "amarilla", clase: "recortada", puntaje: 80 },
    ];
    const m = metricasPorDocumento(filas, 40);
    expect(m.amarilla.bpcer).toBe(0.5);
    expect(m.amarilla.especies.pantalla.apcer).toBe(0.5);
    expect(m.amarilla.especies.recortada.apcer).toBe(0);
    expect(m.amarilla.apcerMax).toBe(0.5);
    expect(m.amarilla.n).toStrictEqual({ autenticos: 2, ataques: 3 });
    expect(m.amarilla.especies.pantalla.ic).toStrictEqual([0.094531, 0.905469]);
  });

  it("FRA-14 propiedad: APCER y BPCER en [0,1] y monótonas en el umbral", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100 })), fc.integer({ min: 0, max: 100 }), (xs, u) => {
        expect(apcer(xs, u)).toBeGreaterThanOrEqual(0);
        expect(apcer(xs, u)).toBeLessThanOrEqual(apcer(xs, u + 1));
        expect(bpcer(xs, u + 1)).toBeLessThanOrEqual(bpcer(xs, u));
      }),
      { numRuns: 1000 },
    );
  });
});

describe("FRA-14 regresión", () => {
  const base = { documentos: { amarilla: { bpcer: 0.02, apcerMax: 0.06, auc: 0.99, bpcerApcer5: 0.02, especies: { pantalla: { apcer: 0.06 } } } } };

  it("FRA-14 regresión: APCER de pantalla de 0,06 a 0,08 falla y nombra la métrica", () => {
    const actual = structuredClone(base);
    actual.documentos.amarilla.especies.pantalla.apcer = 0.08;
    expect(compararConBaseline(actual, base)).toStrictEqual(["documentos.amarilla.especies.pantalla.apcer: 0.06 -> 0.08"]);
  });

  it("FRA-14 un punto exacto no es regresión; AUC empeora si baja", () => {
    const actual = structuredClone(base);
    actual.documentos.amarilla.especies.pantalla.apcer = 0.07;
    actual.documentos.amarilla.auc = 0.97;
    expect(compararConBaseline(actual, base)).toStrictEqual(["documentos.amarilla.auc: 0.99 -> 0.97"]);
    const mejor = structuredClone(base);
    mejor.documentos.amarilla.bpcer = 0;
    expect(compararConBaseline(mejor, base)).toStrictEqual([]);
  });

  it("FRA-14 una métrica que desaparece del reporte es regresión", () => {
    const actual = structuredClone(base);
    delete actual.documentos.amarilla.especies.pantalla;
    expect(compararConBaseline(actual, base)).toStrictEqual(["documentos.amarilla.especies.pantalla.apcer: ausente"]);
  });
});

describe("FRA-15 esquema del reporte de campo", () => {
  const valido = { version: 1, umbral: 40, documentos: { amarilla: { bpcer: 0.02, n: { autenticos: 10, ataques: 10 }, especies: { pantalla: { apcer: 0.1, ic: [0.01, 0.2] } } } } };

  it("FRA-15 admite solo métricas, conteos y versión", () => {
    expect(validarReporteCampo(valido)).toStrictEqual({ ok: true });
  });

  it.each(["ruta", "imagen", "nuip", "participante"])("FRA-15 rechaza la clave %s en cualquier nivel", (clave) => {
    expect(validarReporteCampo({ ...valido, [clave]: "x" })).toStrictEqual({ ok: false, clave });
    const anidado = structuredClone(valido);
    anidado.documentos.amarilla.especies.pantalla[clave] = "x";
    expect(validarReporteCampo(anidado)).toStrictEqual({ ok: false, clave });
  });

  it("FRA-15 rechaza valores de texto y raíces no objeto", () => {
    expect(validarReporteCampo({ ...valido, umbral: "40" }).ok).toBe(false);
    expect(validarReporteCampo(null).ok).toBe(false);
    expect(validarReporteCampo([]).ok).toBe(false);
  });
});

describe("FRA-14 y FRA-15 bordes (mutación)", () => {
  it("AUC sin ataques o sin auténticos es 0,5", () => {
    expect(auc([], [10])).toBe(0.5);
    expect(auc([10], [])).toBe(0.5);
  });

  it("BPCER a APCER 5 %: el umbral 0 también se considera y el objetivo es inclusivo", () => {
    expect(bpcerAApcer({ x: [0] }, [-1, 50], 0.05)).toBe(0.5);
    const especies = { pantalla: [...puntajes(95, 80), ...puntajes(5, 30)] };
    expect(bpcerAApcer(especies, [...puntajes(90, 10), ...puntajes(10, 45)], 0.05)).toBe(0);
  });

  it("métricas separadas por tipo, especies en orden y bordes del umbral", () => {
    const filas = [
      { tipo: "digital", clase: "recortada", puntaje: 40 },
      { tipo: "digital", clase: "autentica", puntaje: 40 },
      { tipo: "digital", clase: "autentica", puntaje: 39 },
      { tipo: "amarilla", clase: "pantalla", puntaje: 39 },
      { tipo: "amarilla", clase: "editada", puntaje: 39 },
      { tipo: "amarilla", clase: "autentica", puntaje: 0 },
    ];
    const m = metricasPorDocumento(filas, 40);
    expect(Object.keys(m)).toStrictEqual(["amarilla", "digital"]);
    expect(Object.keys(m.amarilla.especies)).toStrictEqual(["editada", "pantalla"]);
    expect(m.digital.especies.recortada).toStrictEqual({ apcer: 0, ic: [0, 0.793451], n: 1 });
    expect(m.amarilla.especies.pantalla).toStrictEqual({ apcer: 1, ic: [0.206549, 1], n: 1 });
    expect(m.digital.bpcer).toBe(0.5);
    expect(m.digital.bpcerIc).toStrictEqual([0.094531, 0.905469]);
    expect(m.amarilla.bpcerIc).toStrictEqual([0, 0.793451]);
    expect(m.amarilla.n).toStrictEqual({ autenticos: 1, ataques: 2 });
  });

  it("regresión: cada métrica 'mayor es peor' se compara y los conteos e intervalos no", () => {
    for (const k of ["bpcer", "apcerMax", "bpcerApcer5"]) {
      const b = { documentos: { amarilla: { [k]: 0.02 } } };
      expect(compararConBaseline({ documentos: { amarilla: { [k]: 0.05 } } }, b)).toStrictEqual([`documentos.amarilla.${k}: 0.02 -> 0.05`]);
      expect(compararConBaseline({ documentos: { amarilla: { [k]: 0 } } }, b)).toStrictEqual([]);
    }
    const b = { documentos: { amarilla: { n: { ataques: 10 }, ic: [0, 0.1], auc: 0.9, nombre: null } } };
    expect(compararConBaseline({ documentos: { amarilla: { n: { ataques: 1 }, ic: [0.5, 0.9], auc: 0.9 } } }, b)).toStrictEqual([]);
    expect(compararConBaseline({ documentos: null }, b)).toStrictEqual(["documentos.amarilla.auc: ausente"]);
  });

  it("FRA-15 un reporte completo del corredor es válido; fecha solo AAAA-MM; null y arreglos de texto no", () => {
    const filas = ["amarilla", "digital"].flatMap((tipo) =>
      ["autentica", "pantalla", "fotocopia-gris", "fotocopia-color", "impresion", "recortada", "editada"].map((clase) => ({ tipo, clase, puntaje: 50 })),
    );
    const completo = { version: 1, umbral: 40, fecha: "2026-10", documentos: metricasPorDocumento(filas, 40) };
    expect(validarReporteCampo(completo)).toStrictEqual({ ok: true });
    for (const fecha of ["2026-10-08", "x2026-10", "2026-1", 202610]) expect(validarReporteCampo({ ...completo, fecha })).toStrictEqual({ ok: false, clave: "fecha" });
    expect(validarReporteCampo({ ...completo, umbral: null })).toStrictEqual({ ok: false, clave: "umbral" });
    expect(validarReporteCampo({ version: 1, documentos: { amarilla: { ic: [0, "x"] } } })).toStrictEqual({ ok: false, clave: "valor" });
    expect(validarReporteCampo("x")).toStrictEqual({ ok: false, clave: "raiz" });
  });
});
