// Cambio otros-documentos, OD-04: tabla de países ISO 3166-1 alfa-3 y códigos especiales ICAO 9303 parte 3.
import { describe, expect, it } from "vitest";
import { buscarPaisIcao, PAISES_ICAO } from "../src/index.js";

const ESPECIALES = ["D", "GBD", "GBN", "GBO", "GBP", "GBS", "UNA", "UNK", "UNO", "XOM", "XXA", "XXB", "XXC", "XXX", "EUE", "RKS"];

describe("OD-04 PAISES_ICAO", () => {
  it("tiene 249 códigos ISO alfa-3 + 16 especiales + UTO, todos con nombre no vacío", () => {
    const codigos = Object.keys(PAISES_ICAO);
    expect(codigos).toHaveLength(249 + ESPECIALES.length + 1);
    for (const c of codigos) {
      expect(c).toMatch(/^(?:[A-Z]{3}|D)$/);
      expect(PAISES_ICAO[c]?.length, c).toBeGreaterThan(2);
    }
  });

  it("incluye los especiales ICAO y el espécimen UTO", () => {
    for (const c of ESPECIALES) expect(Object.hasOwn(PAISES_ICAO, c), c).toBe(true);
    expect(PAISES_ICAO.UTO).toContain("espécimen");
  });

  it("nombres en español de muestra", () => {
    expect(PAISES_ICAO.COL).toBe("Colombia");
    expect(PAISES_ICAO.VEN).toBe("Venezuela");
    expect(PAISES_ICAO.D).toBe("Alemania");
    expect(PAISES_ICAO.DEU).toBe("Alemania");
    expect(PAISES_ICAO.ESP).toBe("España");
    expect(PAISES_ICAO.USA).toBe("Estados Unidos");
    expect(PAISES_ICAO.XXA).toBe("Apátrida");
  });

  it("es inmutable", () => {
    expect(Object.isFrozen(PAISES_ICAO)).toBe(true);
  });
});

describe("OD-04 buscarPaisIcao", () => {
  it("normaliza D<< a D", () => {
    expect(buscarPaisIcao("D<<")).toStrictEqual({ codigo: "D", nombre: "Alemania", warnings: [] });
  });
  it("código conocido", () => {
    expect(buscarPaisIcao("COL")).toStrictEqual({ codigo: "COL", nombre: "Colombia", warnings: [] });
  });
  it("QQQ es desconocido sin rechazar", () => {
    expect(buscarPaisIcao("QQQ")).toStrictEqual({ codigo: "QQQ", nombre: null, warnings: ["pais-desconocido"] });
  });
  it("UTO es espécimen", () => {
    expect(buscarPaisIcao("UTO")).toStrictEqual({ codigo: "UTO", nombre: PAISES_ICAO.UTO, warnings: ["pais-especimen"] });
  });
  it("no confunde propiedades del prototipo", () => {
    expect(buscarPaisIcao("__proto__").nombre).toBeNull();
    expect(buscarPaisIcao("toString").nombre).toBeNull();
    expect(buscarPaisIcao("<<<")).toStrictEqual({ codigo: "", nombre: null, warnings: ["pais-desconocido"] });
  });
});
