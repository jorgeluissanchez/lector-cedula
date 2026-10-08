// OFF-20 Atribución de datos y licencias de terceros (pwa-lectura-offline, condiciones C1 a C3 del revisor de licencias).
import { describe, expect, it } from "vitest";
import { reducir, type Estado } from "../src/estado";
import { LICENCIA_CC_BY_SA, RUTA_AVISOS, TEXTO_LICENCIAS } from "../src/licencias";
import { textoAvisosTerceros } from "../avisos-terceros";

const resultado: Estado = { pantalla: "resultado", aviso: null, lectura: { ok: true, tipo: "pdf417", intento: "original", resultado: { campos: {} } } };

describe("OFF-20 Atribución de datos y licencias", () => {
  it("OFF-20 Pantalla de licencias: textos de atribución DANE y Registraduría", () => {
    const t = TEXTO_LICENCIAS.join("\n");
    for (const s of ["DANE", "DIVIPOLA Códigos municipios", "gdxc-w37w", "Material adaptado: solo pares de códigos DIVIPOL-DIVIPOLA", "Registraduría Nacional del Estado Civil", "vh8b-jfhg", "AZERBAIYAN", "VIETNAM", "SINGAPUR", "88195", "88480", "se ofrece tal cual", "sin aval", "CC BY-SA 4.0", "MIT"]) {
      expect(t, s).toContain(s);
    }
    expect(LICENCIA_CC_BY_SA).toBe("https://creativecommons.org/licenses/by-sa/4.0/legalcode.es");
    expect(RUTA_AVISOS).toBe("/assets/THIRD_PARTY_LICENSES.txt");
  });

  it("OFF-20 licencias desde inicio y resultado; Volver regresa a la anterior; ocultar descarta", () => {
    const inicio: Estado = { pantalla: "inicio", aviso: null };
    const desdeInicio = reducir(inicio, { tipo: "licencias" });
    expect(desdeInicio).toStrictEqual({ pantalla: "licencias", aviso: null, anterior: inicio });
    expect(reducir(desdeInicio, { tipo: "volver" })).toBe(inicio);
    const desdeResultado = reducir(resultado, { tipo: "licencias" });
    expect(reducir(desdeResultado, { tipo: "volver" })).toBe(resultado);
    expect(reducir(desdeResultado, { tipo: "oculta" })).toStrictEqual({ pantalla: "inicio", aviso: null });
    for (const e of [{ pantalla: "activo", aviso: null }, { pantalla: "leyendo", aviso: null }] as Estado[]) expect(reducir(e, { tipo: "licencias" })).toBe(e);
    expect(reducir(inicio, { tipo: "volver" })).toBe(inicio);
  });

  it("OFF-20 Avisos de terceros: textos completos y modelo con fuente y sha256", () => {
    const t = textoAvisosTerceros();
    for (const s of ["Apache License", "Version 2.0", "tesseract.js", "tesseract.js-core", "zxing-wasm", "zxing-cpp", "Preact", "Leptonica", "BSD-3-Clause", "tesseract-mrz", "e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd", "DoubangoTelecom/tesseractMRZ", "MIT License"]) {
      expect(t, s).toContain(s);
    }
  });

  it("OFF-20 Avisos de terceros: sin marcas pendientes y con cada componente redistribuido y su titular", () => {
    const t = textoAvisosTerceros();
    expect(t).not.toMatch(/PENDIENTE/i);
    for (const s of [
      "Copyright (C) 2001-2020 Leptonica",
      "4af068b56a9674da915debea4ed7e1b9885b17e8",
      "Copyright (c) 2019, DoubangoTelecom",
      "mrz 5.0.2 (MIT)",
      "Copyright (c) 2016 cheminfo",
      "Copyright 2016 Nu-book Inc.",
      "Copyright 2016 ZXing authors",
      "Axel Waggershauser",
      "2ecec3f5be0ee803f6e14a5a2c7028c0cfe525b4",
      "Tesseract OCR (Apache-2.0)",
      "Hewlett-Packard Ltd.",
      "Google Inc.",
      "Copyright (c) 1988-1997 Sam Leffler",
      "Copyright (c) 1991-1997 Silicon Graphics, Inc.",
      "Eitol/colombian-cedula-reader",
      "Copyright (c) Hector Oliveros",
      "d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
      "zlib",
    ]) {
      expect(t, s).toContain(s);
    }
  });
});
