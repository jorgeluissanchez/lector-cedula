// Cambio otros-documentos: OD-11, OD-11a, OD-11b, OD-11c y OD-12 (clasificación por MRZ, hipótesis como warnings).
import { describe, expect, it } from "vitest";
import { clasificarDocumento } from "../src/index.js";
import { CE_SINTETICA, DATOS_CE, ESPECIMEN_ICAO, generarTd1, PASAPORTE_COL } from "./ayudas/generador-mrz-icao.js";

const REF = { fechaReferencia: "2026-10-08" };
const HIPOTESIS_CE = ["CE01", "CE02", "CE03", "CE05", "CE06", "CE07"];

function exito(r: ReturnType<typeof clasificarDocumento>) {
  if (!r.ok) throw new Error(`se esperaba ok: ${JSON.stringify(r)}`);
  return r;
}

describe("OD-11 Clasificación de la CE", () => {
  it("CE clasificada con hipótesis", () => {
    const r = exito(clasificarDocumento(CE_SINTETICA, REF));
    expect(r.tipoDocumento).toBe("cedula-extranjeria");
    expect(r.fuente).toBe("mrz-td1");
    expect(r.warnings).toStrictEqual(HIPOTESIS_CE);
  });

  it.each(["ID", "IE"])("código %s también es CE", (codigo) => {
    expect(exito(clasificarDocumento(generarTd1({ ...DATOS_CE, codigo }), REF)).tipoDocumento).toBe("cedula-extranjeria");
  });

  it("digital colombiana", () => {
    const r = exito(clasificarDocumento(["ICCOL1234567897<<<<<<<<<<<<<<<", "8001014F3001019COL1234567890<5", "PEREZ<<ANA<<<<<<<<<<<<<<<<<<<<"], REF));
    expect(r.tipoDocumento).toBe("cedula-ciudadania");
    expect(r.fuente).toBe("mrz-td1");
    expect(r.warnings.some((w) => w.startsWith("CE"))).toBe(false);
  });

  it("TD1 extranjero", () => {
    expect(clasificarDocumento(generarTd1({ ...DATOS_CE, emisor: "ESP" }), REF)).toStrictEqual({ ok: false, error: "documento-no-admitido" });
  });

  it("I< de emisor COL con nacionalidad COL no es CE", () => {
    expect(clasificarDocumento(generarTd1({ ...DATOS_CE, nacionalidad: "COL" }), REF)).toStrictEqual({ ok: false, error: "documento-no-admitido" });
  });

  it("otro código con emisor COL no se admite", () => {
    expect(clasificarDocumento(generarTd1({ ...DATOS_CE, codigo: "AC" }), REF)).toStrictEqual({ ok: false, error: "documento-no-admitido" });
  });
});

describe("OD-11a Hipótesis de la CE como warnings", () => {
  it("todas las aplicables y no CE04; se conservan los warnings del parser", () => {
    const r = exito(clasificarDocumento(generarTd1({ ...DATOS_CE, vencimiento: "200101" }), REF));
    expect(r.warnings).toStrictEqual(["documento-vencido", ...HIPOTESIS_CE]);
    expect(r.warnings).not.toContain("CE04");
  });
});

describe("OD-11b TI por MRZ no admitida", () => {
  it.each(["IT", "TI"])("TD1 %s", (codigo) => {
    expect(clasificarDocumento(generarTd1({ ...DATOS_CE, codigo, nacionalidad: "COL" }), REF)).toStrictEqual({
      ok: false,
      error: "documento-no-admitido",
      warnings: ["T01"],
    });
  });
});

describe("OD-11c Forma de la clasificación", () => {
  it("pasaporte", () => {
    const r = exito(clasificarDocumento(ESPECIMEN_ICAO, REF));
    expect(r.tipoDocumento).toBe("pasaporte");
    expect(r.fuente).toBe("mrz-td3");
    expect(r.campos).toMatchObject({ numeroDocumento: "L898902C3" });
    expect(Object.keys(r).sort()).toStrictEqual(["campos", "fuente", "ok", "tipoDocumento", "warnings"]);
    expect(exito(clasificarDocumento(PASAPORTE_COL, REF)).warnings).toStrictEqual([]);
  });

  it("propaga el error del parser", () => {
    expect(clasificarDocumento(["P<UTO", "x"], REF)).toStrictEqual({ ok: false, error: "formato-td3" });
    expect(clasificarDocumento(null, REF)).toStrictEqual({ ok: false, error: "formato-td1" });
    expect(clasificarDocumento([CE_SINTETICA[0], CE_SINTETICA[1].slice(0, 29) + "5", CE_SINTETICA[2]], REF)).toMatchObject({
      ok: false,
      error: "digito-control",
    });
  });
});

describe("OD-12 Número de la CE", () => {
  it("número de 7 dígitos sin nuip", () => {
    const r = exito(clasificarDocumento(CE_SINTETICA, REF));
    expect(r.campos.numeroDocumento).toBe("1234567");
    expect(r.campos).not.toHaveProperty("nuip");
  });

  it("ceros a la izquierda", () => {
    expect(exito(clasificarDocumento(generarTd1({ ...DATOS_CE, numero: "0012345" }), REF)).campos.numeroDocumento).toBe("0012345");
  });

  it("número que termina en letra también lleva el warning", () => {
    expect(exito(clasificarDocumento(generarTd1({ ...DATOS_CE, numero: "123456E" }), REF)).warnings).toContain("CE03-numero-no-numerico");
  });

  it("número con letras se devuelve igual con warning", () => {
    const r = exito(clasificarDocumento(generarTd1({ ...DATOS_CE, numero: "E123456" }), REF));
    expect(r.campos.numeroDocumento).toBe("E123456");
    expect(r.warnings).toStrictEqual([...HIPOTESIS_CE, "CE03-numero-no-numerico"]);
  });
});
