// FRA-04, FRA-05, FRA-06 (cambio deteccion-fraude): configuración, política y agregación.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CODIGOS_MOTIVO,
  CONFIG_FRAUDE_POR_DEFECTO,
  type ConfigFraude,
  type Motivo,
  type CodigoMotivo,
  agregarMotivos,
  decidirAccion,
  nivelPorPuntaje,
  validarConfigFraude,
} from "../src/index.js";

const CODIGOS: CodigoMotivo[] = ["pantalla", "fotocopia", "recorte", "edicion", "inconsistencia"];
const m = (codigo: CodigoMotivo, puntaje: number, detalle = "moire"): Motivo => ({ codigo, puntaje, detalle });

describe("FRA-05 configuración por instancia", () => {
  it("FRA-05 valores por defecto", () => {
    expect(CONFIG_FRAUDE_POR_DEFECTO.umbralMedio).toBe(40);
    expect(CONFIG_FRAUDE_POR_DEFECTO.umbralAlto).toBe(70);
    expect(CONFIG_FRAUDE_POR_DEFECTO.bloquearSi).toBeUndefined();
    expect(CONFIG_FRAUDE_POR_DEFECTO.modelo.habilitado).toBe(false);
    expect(CONFIG_FRAUDE_POR_DEFECTO.pesos).toStrictEqual({ pantalla: 1, fotocopia: 1, recorte: 0.8, edicion: 0.5, inconsistencia: 1 });
  });

  it("FRA-05 umbrales invertidos", () => {
    expect(validarConfigFraude({ umbralMedio: 80, umbralAlto: 50 })).toStrictEqual({ ok: false, error: "config-fraude-invalida", campo: "umbralAlto" });
  });

  it("FRA-05 motivosMinimos 1 sin motivoUnico (P3)", () => {
    expect(validarConfigFraude({ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1 } })).toStrictEqual({
      ok: false,
      error: "config-fraude-invalida",
      campo: "bloquearSi.motivosMinimos",
    });
    expect(validarConfigFraude({ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1, motivoUnico: true } }).ok).toBe(true);
  });

  it.each([
    [null, "config"],
    [[], "config"],
    [{ umbralMedio: "40" }, "umbralMedio"],
    [{ umbralMedio: 0 }, "umbralMedio"],
    [{ umbralMedio: 40.5 }, "umbralMedio"],
    [{ umbralAlto: 101 }, "umbralAlto"],
    [{ umbralMedio: 70, umbralAlto: 70 }, "umbralAlto"],
    [{ pesos: { pantalla: 1.1 } }, "pesos.pantalla"],
    [{ pesos: { pantalla: -0.1 } }, "pesos.pantalla"],
    [{ pesos: { deepfake: 1 } }, "pesos.deepfake"],
    [{ pesos: 3 }, "pesos"],
    [{ otra: 1 }, "otra"],
    [{ bloquearSi: 1 }, "bloquearSi"],
    [{ bloquearSi: { puntajeMinimo: 0, motivosMinimos: 2 } }, "bloquearSi.puntajeMinimo"],
    [{ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 6 } }, "bloquearSi.motivosMinimos"],
    [{ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2, motivoUnico: "si" } }, "bloquearSi.motivoUnico"],
    [{ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2, x: 1 } }, "bloquearSi.x"],
    [{ modelo: { habilitado: "true" } }, "modelo.habilitado"],
    [{ modelo: null }, "modelo"],
  ])("FRA-05 rechaza %j en el campo %s", (entrada, campo) => {
    expect(validarConfigFraude(entrada)).toStrictEqual({ ok: false, error: "config-fraude-invalida", campo });
  });

  it("FRA-05 completa con los valores por defecto", () => {
    const r = validarConfigFraude({ umbralMedio: 30, pesos: { edicion: 0.2 } });
    expect(r).toStrictEqual({
      ok: true,
      config: { ...CONFIG_FRAUDE_POR_DEFECTO, umbralMedio: 30, pesos: { ...CONFIG_FRAUDE_POR_DEFECTO.pesos, edicion: 0.2 } },
    });
    expect(validarConfigFraude(undefined)).toStrictEqual({ ok: true, config: CONFIG_FRAUDE_POR_DEFECTO });
  });

  it("FRA-05 nivel por umbrales 39/40/69/70", () => {
    expect([39, 40, 69, 70].map((p) => nivelPorPuntaje(p, CONFIG_FRAUDE_POR_DEFECTO))).toStrictEqual(["bajo", "medio", "medio", "alto"]);
  });

  it("FRA-05 propiedad: validar nunca lanza y umbrales válidos se aceptan", () => {
    fc.assert(fc.property(fc.anything(), (x) => { validarConfigFraude(x); }), { numRuns: 1000 });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), fc.integer({ min: 1, max: 100 }), (a, b) => {
        const r = validarConfigFraude({ umbralMedio: a, umbralAlto: b });
        expect(r.ok).toBe(a < b);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("FRA-06 agregación", () => {
  it("FRA-06 agregación literal: pantalla 0,5 y edicion 0,5 con pesos 1 da 75", () => {
    const config: ConfigFraude = { ...CONFIG_FRAUDE_POR_DEFECTO, pesos: { ...CONFIG_FRAUDE_POR_DEFECTO.pesos, edicion: 1 } };
    expect(agregarMotivos([m("pantalla", 0.5), m("edicion", 0.5)], config)).toBe(75);
  });

  it("FRA-06 usa los pesos: edicion 0,5 con peso 0,5 da 25; sin motivos da 0", () => {
    expect(agregarMotivos([m("edicion", 0.5)], CONFIG_FRAUDE_POR_DEFECTO)).toBe(25);
    expect(agregarMotivos([m("recorte", 1)], CONFIG_FRAUDE_POR_DEFECTO)).toBe(80);
    expect(agregarMotivos([], CONFIG_FRAUDE_POR_DEFECTO)).toBe(0);
  });

  const arbMotivos = fc.uniqueArray(
    fc.record({ codigo: fc.constantFrom(...CODIGOS), puntaje: fc.double({ min: 0, max: 1, noNaN: true }) }),
    { selector: (x) => x.codigo, minLength: 1 },
  );

  it("FRA-06 monotonía, rango 0-100 y determinismo", () => {
    fc.assert(
      fc.property(arbMotivos, fc.nat(), fc.double({ min: 0, max: 1, noNaN: true }), (ms, i, extra) => {
        const base = ms.map((x) => m(x.codigo, x.puntaje));
        const k = i % base.length;
        const sube = base.map((x, j) => (j === k ? { ...x, puntaje: Math.min(1, x.puntaje + extra) } : x));
        const p0 = agregarMotivos(base, CONFIG_FRAUDE_POR_DEFECTO);
        const p1 = agregarMotivos(sube, CONFIG_FRAUDE_POR_DEFECTO);
        expect(p1).toBeGreaterThanOrEqual(p0);
        expect(Number.isInteger(p0) && p0 >= 0 && p0 <= 100).toBe(true);
        expect(agregarMotivos(base, CONFIG_FRAUDE_POR_DEFECTO)).toBe(p0);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("FRA-04 política", () => {
  it("FRA-04 por defecto: alto da revisar, bajo da continuar", () => {
    expect(decidirAccion(90, [m("pantalla", 0.9)], CONFIG_FRAUDE_POR_DEFECTO)).toBe("revisar");
    expect(decidirAccion(45, [m("pantalla", 0.45)], CONFIG_FRAUDE_POR_DEFECTO)).toBe("revisar");
    expect(decidirAccion(10, [], CONFIG_FRAUDE_POR_DEFECTO)).toBe("continuar");
  });

  it("FRA-04 instancia que bloquea por puntaje con motivoUnico", () => {
    const c = { ...CONFIG_FRAUDE_POR_DEFECTO, bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1, motivoUnico: true } };
    expect(decidirAccion(90, [m("pantalla", 0.9)], c)).toBe("bloquear");
    expect(decidirAccion(69, [m("pantalla", 0.69)], c)).toBe("revisar");
  });

  it("FRA-04 un solo motivo sin motivoUnico no bloquea; dos motivos distintos sí", () => {
    const c = { ...CONFIG_FRAUDE_POR_DEFECTO, bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2 } };
    expect(decidirAccion(90, [m("pantalla", 0.9)], c)).toBe("revisar");
    expect(decidirAccion(98, [m("pantalla", 0.9), m("recorte", 0.8)], c)).toBe("bloquear");
  });

  it("FRA-04 motivoUnico con motivosMinimos 3 sigue exigiendo 3", () => {
    const c = { ...CONFIG_FRAUDE_POR_DEFECTO, bloquearSi: { puntajeMinimo: 50, motivosMinimos: 3, motivoUnico: true } };
    expect(decidirAccion(98, [m("pantalla", 0.9), m("recorte", 0.8)], c)).toBe("revisar");
  });

  it("FRA-04 propiedad: sin bloquearSi nunca bloquear", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.subarray(CODIGOS), (p, cs) => {
        expect(decidirAccion(p, cs.map((c) => m(c, 1)), CONFIG_FRAUDE_POR_DEFECTO)).not.toBe("bloquear");
      }),
      { numRuns: 1000 },
    );
  });
});

describe("FRA-04 y FRA-05 bordes (mutación)", () => {
  it("vocabulario cerrado de códigos", () => {
    expect(CODIGOS_MOTIVO).toStrictEqual(["pantalla", "fotocopia", "recorte", "edicion", "inconsistencia"]);
  });

  it("motivoUnico se conserva tal cual (también false) y no aparece si no se da", () => {
    const con = validarConfigFraude({ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2, motivoUnico: false } });
    expect(con.ok && con.config.bloquearSi).toStrictEqual({ puntajeMinimo: 70, motivosMinimos: 2, motivoUnico: false });
    const sin = validarConfigFraude({ bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2 } });
    expect(sin.ok && sin.config.bloquearSi).toStrictEqual({ puntajeMinimo: 70, motivosMinimos: 2 });
  });

  it("pesos en los bordes 0 y 1; no numéricos o NaN se rechazan", () => {
    const r = validarConfigFraude({ pesos: { pantalla: 0, fotocopia: 1 } });
    expect(r.ok && r.config.pesos).toStrictEqual({ ...CONFIG_FRAUDE_POR_DEFECTO.pesos, pantalla: 0, fotocopia: 1 });
    for (const v of [Number.NaN, "1", null]) expect(validarConfigFraude({ pesos: { recorte: v } })).toStrictEqual({ ok: false, error: "config-fraude-invalida", campo: "pesos.recorte" });
  });

  it("modelo habilitado se copia; sin booleano se rechaza", () => {
    const r = validarConfigFraude({ modelo: { habilitado: true } });
    expect(r.ok && r.config.modelo).toStrictEqual({ habilitado: true });
    expect(validarConfigFraude({ modelo: {} })).toStrictEqual({ ok: false, error: "config-fraude-invalida", campo: "modelo.habilitado" });
  });

  it("bloquear con puntaje igual al mínimo; una config sin validar con motivosMinimos 1 sigue exigiendo 2", () => {
    const c = { ...CONFIG_FRAUDE_POR_DEFECTO, bloquearSi: { puntajeMinimo: 70, motivosMinimos: 2 } };
    expect(decidirAccion(70, [m("pantalla", 0.5), m("recorte", 0.5)], c)).toBe("bloquear");
    const cruda = { ...CONFIG_FRAUDE_POR_DEFECTO, bloquearSi: { puntajeMinimo: 70, motivosMinimos: 1 } };
    expect(decidirAccion(90, [m("pantalla", 0.9)], cruda)).toBe("revisar");
  });
});
