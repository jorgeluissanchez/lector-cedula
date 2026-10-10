// Cambio demo-opciones, DOP-02 "Formato de las preferencias" (tarea 1.1): preferencias de interfaz de la demo, una clave
// con tres valores enumerados. Datos sintéticos: el NUIP 9999123456 de PERSONA_BASE solo aparece como basura a descartar.
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { CLAVE_PREFERENCIAS, guardarPreferencias, leerPreferencias, PREFERENCIAS_POR_OMISION, type AlmacenPreferencias, type FormaCamara } from "../src/preferencias";

function espia(valor: string | null = null) {
  return {
    getItem: vi.fn<(clave: string) => string | null>(() => valor),
    setItem: vi.fn<(clave: string, v: string) => void>(),
    removeItem: vi.fn<(clave: string) => void>(),
  };
}

function enMemoria(): AlmacenPreferencias & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

describe("DOP-02 Formato de las preferencias", () => {
  it("DOP-02 constantes", () => {
    expect(CLAVE_PREFERENCIAS).toBe("lector-cedula:demo-opciones");
    expect(PREFERENCIAS_POR_OMISION).toStrictEqual({ forma: "pantalla-completa", tarjetaIdentidad: false, fraude: false });
    expect(Object.isFrozen(PREFERENCIAS_POR_OMISION)).toBe(true);
  });

  it("DOP-02 Guardar", () => {
    const a = espia();
    guardarPreferencias(a, { forma: "recuadro-vertical", tarjetaIdentidad: true, fraude: false });
    expect(a.setItem.mock.calls).toStrictEqual([["lector-cedula:demo-opciones", '{"forma":"recuadro-vertical","tarjetaIdentidad":true,"fraude":false}']]);
    expect(a.removeItem).not.toHaveBeenCalled();
  });

  it("DOP-02 Guardar solo copia las tres claves aunque el objeto traiga más", () => {
    const a = espia();
    const conExtra = { forma: "recuadro-horizontal", tarjetaIdentidad: false, fraude: true, nuip: "9999123456" } as const;
    guardarPreferencias(a, conExtra);
    expect(a.setItem.mock.calls).toStrictEqual([["lector-cedula:demo-opciones", '{"forma":"recuadro-horizontal","tarjetaIdentidad":false,"fraude":true}']]);
  });

  it("DOP-02 Valores por omisión borran la clave", () => {
    const a = espia();
    guardarPreferencias(a, { forma: "pantalla-completa", tarjetaIdentidad: false, fraude: false });
    expect(a.removeItem.mock.calls).toStrictEqual([["lector-cedula:demo-opciones"]]);
    expect(a.setItem).not.toHaveBeenCalled();
  });

  it("DOP-02 Valores inválidos", () => {
    const a = espia('{"forma":"cuadrado","tarjetaIdentidad":"si","fraude":true,"nuip":"9999123456"}');
    expect(leerPreferencias(a)).toStrictEqual({ forma: "pantalla-completa", tarjetaIdentidad: false, fraude: true });
    expect(a.getItem.mock.calls).toStrictEqual([["lector-cedula:demo-opciones"]]);
    for (const v of ["no es json", "null", "[1]", null, "", "1", '"recuadro-vertical"', "{}"]) {
      expect(leerPreferencias(espia(v)), String(v)).toStrictEqual(PREFERENCIAS_POR_OMISION);
    }
  });

  it("DOP-02 Lee cada campo válido por separado", () => {
    expect(leerPreferencias(espia('{"forma":"recuadro-horizontal"}'))).toStrictEqual({ forma: "recuadro-horizontal", tarjetaIdentidad: false, fraude: false });
    expect(leerPreferencias(espia('{"tarjetaIdentidad":true,"fraude":1}'))).toStrictEqual({ forma: "pantalla-completa", tarjetaIdentidad: true, fraude: false });
    expect(leerPreferencias(espia('{"forma":"recuadro-vertical","tarjetaIdentidad":false,"fraude":true}'))).toStrictEqual({ forma: "recuadro-vertical", tarjetaIdentidad: false, fraude: true });
  });

  it("DOP-02 Almacén no disponible", () => {
    expect(leerPreferencias(null)).toStrictEqual(PREFERENCIAS_POR_OMISION);
    expect(() => guardarPreferencias(null, { forma: "recuadro-vertical", tarjetaIdentidad: true, fraude: true })).not.toThrow();
    const lanza = (nombre: string) => () => {
      throw new DOMException("bloqueado", nombre);
    };
    const roto: AlmacenPreferencias = { getItem: lanza("SecurityError"), setItem: lanza("QuotaExceededError"), removeItem: lanza("SecurityError") };
    expect(leerPreferencias(roto)).toStrictEqual(PREFERENCIAS_POR_OMISION);
    expect(() => guardarPreferencias(roto, { forma: "recuadro-vertical", tarjetaIdentidad: true, fraude: true })).not.toThrow();
    expect(() => guardarPreferencias(roto, PREFERENCIAS_POR_OMISION)).not.toThrow();
  });

  it("DOP-02 Ida y vuelta", () => {
    const formas: readonly FormaCamara[] = ["pantalla-completa", "recuadro-horizontal", "recuadro-vertical"];
    let conClave = 0;
    fc.assert(
      fc.property(fc.constantFrom(...formas), fc.boolean(), fc.boolean(), (forma, tarjetaIdentidad, fraude) => {
        const a = enMemoria();
        const p = { forma, tarjetaIdentidad, fraude };
        guardarPreferencias(a, p);
        expect(leerPreferencias(a)).toStrictEqual(p);
        const v = a.datos.get(CLAVE_PREFERENCIAS);
        if (v !== undefined) {
          conClave++;
          expect(Object.keys(JSON.parse(v) as object)).toStrictEqual(["forma", "tarjetaIdentidad", "fraude"]);
        }
        expect([...a.datos.keys()].every((k) => k === CLAVE_PREFERENCIAS)).toBe(true);
      }),
      { numRuns: 1000 },
    );
    // 11 de las 12 combinaciones escriben la clave: la rama "guardado" no es vacía.
    expect(conClave).toBeGreaterThan(500);
  });

  it("DOP-02 nunca lanza con cualquier texto guardado", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.json()), (v) => {
        const p = leerPreferencias(espia(v));
        expect(["pantalla-completa", "recuadro-horizontal", "recuadro-vertical"]).toContain(p.forma);
        expect(Object.keys(p)).toStrictEqual(["forma", "tarjetaIdentidad", "fraude"]);
      }),
      { numRuns: 1000 },
    );
  });
});
