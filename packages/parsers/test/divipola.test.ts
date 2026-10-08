// Equivalencia DIVIPOL -> DIVIPOLA (cambio divipol-registraduria, requisitos DV-15, DV-16 y DV-17; design.md
// decisiones 3, 5 y 6). Oráculos independientes del generador: conteos y tabla de departamentos literales de la
// spec, y los códigos DANE leídos de la instantánea con una expresión regular propia de esta prueba.
// Datos públicos: códigos de lugar.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buscarDivipol } from "../src/divipol/buscar.js";
import { FILAS_DIVIPOL } from "../src/divipol/tabla.generated.js";
import { DIVIPOLA_METADATOS, divipolADivipola } from "../src/divipola/index.js";
import type { ResultadoEquivalencia } from "../src/divipola/index.js";
import { EQUIVALENCIAS_DIVIPOLA, FUENTE_EQUIVALENCIAS } from "../src/divipola/equivalencias.generated.js";
import * as principal from "../src/index.js";

const SHA_DANE = "159b4b84595a11be5bf623fdf25c6fd5c9ac8c3ed898cf7928b2b3f321b9b492";
const RUTA_DANE = new URL("../../../tools/divipol/fuentes/divipola-dane.csv", import.meta.url);
const RUTA_EQUIVALENCIAS = new URL("../src/divipola/equivalencias.generated.ts", import.meta.url);

// DV-16, escenario "Tabla literal de departamentos".
const DEPARTAMENTO_DANE: Record<string, string> = {
  "01": "05", "03": "08", "05": "13", "07": "15", "09": "17", "11": "19", "12": "20", "13": "23", "15": "25",
  "16": "11", "17": "27", "19": "41", "21": "47", "23": "52", "24": "66", "25": "54", "26": "63", "27": "68",
  "28": "70", "29": "73", "31": "76", "40": "81", "44": "18", "46": "85", "48": "44", "50": "94", "52": "50",
  "54": "95", "56": "88", "60": "91", "64": "86", "68": "97", "72": "99",
};

/** Códigos de municipio de la instantánea del DANE: tercer campo de cada fila de datos. */
function codigosDane(): string[] {
  const filas = readFileSync(RUTA_DANE, "utf8").split("\n").slice(1).filter((l) => l !== "");
  return filas.map((linea) => /^[0-9]{2},(?:"[^"]*"|[^,]*),([0-9]{5}),/.exec(linea)?.[1] ?? `ilegible: ${linea}`);
}

describe("equivalencia generada: integridad (DV-16)", () => {
  const municipales = FILAS_DIVIPOL.map(([codigo]) => codigo).filter((codigo) => !codigo.startsWith("88"));
  const consulados = FILAS_DIVIPOL.map(([codigo]) => codigo).filter((codigo) => codigo.startsWith("88"));

  it("DV-16 conteo por método: 1042 nombre-exacto, 48 nombre-sin-parentesis, 33 manual con código y ninguna sin equivalente", () => {
    const conteo: Record<string, number> = {};
    for (const [, divipola, metodo] of EQUIVALENCIAS_DIVIPOLA) {
      const clave = divipola === null ? `${metodo} sin equivalente` : metodo;
      conteo[clave] = (conteo[clave] ?? 0) + 1;
    }
    expect(conteo).toStrictEqual({ "nombre-exacto": 1042, "nombre-sin-parentesis": 48, manual: 33 });
    expect(EQUIVALENCIAS_DIVIPOLA.filter(([, divipola]) => divipola === null).map(([divipol]) => divipol)).toStrictEqual([]);
  });

  it("DV-16 cubre exactamente las 1123 filas municipales en orden de código y deja fuera los 67 consulados", () => {
    const codigos = EQUIVALENCIAS_DIVIPOLA.map(([divipol]) => divipol);
    expect(municipales).toHaveLength(1123);
    expect(consulados).toHaveLength(67);
    expect(codigos).toStrictEqual(municipales);
    expect(codigos.filter((codigo) => consulados.includes(codigo))).toStrictEqual([]);
  });

  it("DV-16 todo divipola empieza por el código DANE de su departamento (salvo 15001, el duplicado documentado de Bogotá)", () => {
    const fuera = EQUIVALENCIAS_DIVIPOLA.filter(
      ([divipol, divipola]) => divipola !== null && divipol !== "15001" && divipola.slice(0, 2) !== DEPARTAMENTO_DANE[divipol.slice(0, 2)],
    );
    expect(fuera).toStrictEqual([]);
    expect(EQUIVALENCIAS_DIVIPOLA.find(([divipol]) => divipol === "15001")).toStrictEqual(["15001", "11001", "manual"]);
    // La propiedad no es vacía: los 33 departamentos municipales aparecen en la equivalencia.
    expect(new Set(EQUIVALENCIAS_DIVIPOLA.map(([divipol]) => divipol.slice(0, 2))).size).toBe(33);
  });

  it("DV-16 los únicos códigos DANE con más de un código DIVIPOL son 11001 (15001 y 16001) y 94343 (50050 y 50070)", () => {
    const porDane = new Map<string, string[]>();
    for (const [divipol, divipola] of EQUIVALENCIAS_DIVIPOLA) {
      if (divipola !== null) porDane.set(divipola, [...(porDane.get(divipola) ?? []), divipol]);
    }
    expect([...porDane].filter(([, divipol]) => divipol.length > 1)).toStrictEqual([
      ["11001", ["15001", "16001"]],
      ["94343", ["50050", "50070"]],
    ]);
  });

  it("DV-16 todo divipola existe en la instantánea del DANE y el único código DANE sin pareja es 27493", () => {
    const dane = codigosDane();
    expect(dane).toHaveLength(1122);
    expect(new Set(dane).size).toBe(1122);
    const usados = new Set(EQUIVALENCIAS_DIVIPOLA.map(([, divipola]) => divipola));
    expect([...usados].filter((codigo) => codigo !== null && !dane.includes(codigo))).toStrictEqual([]);
    expect(dane.filter((codigo) => !usados.has(codigo))).toStrictEqual(["27493"]);
  });

  it("DV-16 casos literales de DV-15 en la tabla generada", () => {
    const fila = (codigo: string) => EQUIVALENCIAS_DIVIPOLA.find(([divipol]) => divipol === codigo);
    expect(fila("01001")).toStrictEqual(["01001", "05001", "nombre-exacto"]);
    expect(fila("31001")).toStrictEqual(["31001", "76001", "manual"]);
    expect(fila("16001")).toStrictEqual(["16001", "11001", "nombre-exacto"]);
    expect(fila("56001")).toStrictEqual(["56001", "88001", "nombre-exacto"]);
    expect(fila("11058")).toStrictEqual(["11058", "19532", "nombre-sin-parentesis"]);
    expect(fila("50050")).toStrictEqual(["50050", "94343", "manual"]);
    expect(fila("50070")).toStrictEqual(["50070", "94343", "nombre-sin-parentesis"]);
  });

  it("DV-17 la cabecera y los metadatos de la fuente declaran el SHA-256 de la instantánea del DANE", () => {
    const calculado = createHash("sha256").update(readFileSync(RUTA_DANE)).digest("hex");
    const cabecera = /^\/\/ SHA-256: ([0-9a-f]{64})$/m.exec(readFileSync(RUTA_EQUIVALENCIAS, "utf8"))?.[1];
    expect(calculado).toBe(SHA_DANE);
    expect(cabecera).toBe(SHA_DANE);
    expect(FUENTE_EQUIVALENCIAS.sha256).toBe(SHA_DANE);
  });
});

describe("DV-15 equivalencia DIVIPOL a DIVIPOLA", { timeout: 60_000 }, () => {
  it("DV-15 Antioquia 01 a 05", () => {
    expect(divipolADivipola("01001")).toStrictEqual({ equivalente: true, divipol: "01001", divipola: "05001", metodo: "nombre-exacto", warnings: [] });
  });

  it("DV-15 Valle 31 a 76", () => {
    expect(divipolADivipola("31001")).toStrictEqual({ equivalente: true, divipol: "31001", divipola: "76001", metodo: "manual", warnings: [] });
  });

  it("DV-15 Bogotá 16 a 11 y su duplicado", () => {
    expect(divipolADivipola("16001")).toStrictEqual({ equivalente: true, divipol: "16001", divipola: "11001", metodo: "nombre-exacto", warnings: [] });
    expect(divipolADivipola("15001")).toStrictEqual({ equivalente: true, divipol: "15001", divipola: "11001", metodo: "manual", warnings: ["D02"] });
  });

  it("DV-15 San Andrés 56 a 88 sin confundirse con consulados", () => {
    expect(divipolADivipola("56001")).toStrictEqual({ equivalente: true, divipol: "56001", divipola: "88001", metodo: "nombre-exacto", warnings: [] });
    expect(divipolADivipola("88815")).toStrictEqual({ equivalente: false, divipol: "88815", motivo: "consulado", warnings: ["D03"] });
  });

  it("DV-15 nombre con alias entre paréntesis", () => {
    expect(divipolADivipola("11058")).toStrictEqual({ equivalente: true, divipol: "11058", divipola: "19532", metodo: "nombre-sin-parentesis", warnings: [] });
  });

  it("DV-15 Mapiripana equivale a Barrancominas", () => {
    expect(divipolADivipola("50050")).toStrictEqual({ equivalente: true, divipol: "50050", divipola: "94343", metodo: "manual", warnings: [] });
    expect(divipolADivipola("50070")).toStrictEqual({ equivalente: true, divipol: "50070", divipola: "94343", metodo: "nombre-sin-parentesis", warnings: [] });
  });

  it("DV-15 entradas no resolubles", () => {
    expect(divipolADivipola("17082")).toStrictEqual({ equivalente: false, divipol: "17082", motivo: "desconocido", warnings: ["D01"] });
    expect(divipolADivipola("00000")).toStrictEqual({ equivalente: false, divipol: "00000", motivo: "sin-dato", warnings: ["D04"] });
    expect(divipolADivipola(" 01001")).toStrictEqual({ equivalente: false, divipol: null, motivo: "formato-invalido", warnings: [] });
  });

  it("DV-15 los arreglos warnings son nuevos en cada llamada", () => {
    for (const codigo of ["15001", "88815", "17082", "00000", "01001", "50050"]) divipolADivipola(codigo).warnings.push("X");
    expect(divipolADivipola("15001").warnings).toStrictEqual(["D02"]);
    expect(divipolADivipola("88815").warnings).toStrictEqual(["D03"]);
    expect(divipolADivipola("17082").warnings).toStrictEqual(["D01"]);
    expect(divipolADivipola("00000").warnings).toStrictEqual(["D04"]);
    expect(divipolADivipola("01001").warnings).toStrictEqual([]);
    expect(divipolADivipola("50050").warnings).toStrictEqual([]);
  });

  const totalYDeterminista = (valor: unknown): void => {
    const a = divipolADivipola(valor);
    const b = divipolADivipola(valor);
    expect(b).toStrictEqual(a);
    expect(b.warnings).not.toBe(a.warnings);
  };

  it("DV-15 total y determinista con fc.anything()", () => {
    fc.assert(fc.property(fc.anything(), totalYDeterminista), { numRuns: 1000 });
  });

  it("DV-15 total y determinista con fc.string()", () => {
    fc.assert(fc.property(fc.string(), totalYDeterminista), { numRuns: 1000 });
  });

  it("DV-15 total y determinista con fc.string({ unit: \"binary\" })", () => {
    fc.assert(fc.property(fc.string({ unit: "binary" }), totalYDeterminista), { numRuns: 1000 });
  });

  it("DV-15 total y determinista con códigos de la tabla y cadenas de 5 dígitos", () => {
    const entrada = fc.oneof(fc.constantFrom(...FILAS_DIVIPOL.map(([codigo]) => codigo)), fc.stringMatching(/^[0-9]{5}$/));
    fc.assert(fc.property(entrada, totalYDeterminista), { numRuns: 1000 });
  });

  it("DV-15 propiedad exhaustiva: 1123 equivalentes, 0 sin-equivalente y 67 consulados en las 1190 filas", () => {
    const conteo: Record<string, number> = {};
    const discrepancias: string[] = [];
    for (const [codigo] of FILAS_DIVIPOL) {
      const resultado: ResultadoEquivalencia = divipolADivipola(codigo);
      const clave = resultado.equivalente ? "equivalente" : resultado.motivo;
      conteo[clave] = (conteo[clave] ?? 0) + 1;
      const busqueda = buscarDivipol(codigo);
      const esperadoConsulado = codigo.startsWith("88");
      if (resultado.divipol !== codigo || JSON.stringify(resultado.warnings) !== JSON.stringify(busqueda.warnings)) discrepancias.push(codigo);
      if (esperadoConsulado !== (!resultado.equivalente && resultado.motivo === "consulado")) discrepancias.push(codigo);
      if (resultado.equivalente) {
        const fila = EQUIVALENCIAS_DIVIPOLA.find(([divipol]) => divipol === codigo);
        if (fila?.[1] !== resultado.divipola || fila[2] !== resultado.metodo) discrepancias.push(codigo);
      }
    }
    expect(conteo).toStrictEqual({ equivalente: 1123, consulado: 67 });
    expect(discrepancias).toStrictEqual([]);
  });
});

/** Rutas de los módulos alcanzados por importaciones o reexportaciones relativas desde un archivo fuente. */
function grafoDeImportaciones(entrada: URL): URL[] {
  const relativas = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g;
  const visitados = new Map<string, URL>();
  const pendientes = [entrada];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as URL;
    if (visitados.has(actual.href)) continue;
    visitados.set(actual.href, actual);
    for (const [, especificador] of readFileSync(actual, "utf8").matchAll(relativas)) {
      const destino = new URL((especificador ?? "").replace(/\.js$/, ".ts"), actual);
      pendientes.push(existsSync(destino) ? destino : new URL(`${destino.href}/index.ts`));
    }
  }
  return [...visitados.values()];
}

describe("DV-17 aislamiento de la licencia CC BY-SA", () => {
  const RAIZ_PAQUETE = new URL("../", import.meta.url);
  const INDICE = new URL("src/index.ts", RAIZ_PAQUETE);

  it("DV-17 el punto de entrada principal no incluye DIVIPOLA", () => {
    const modulos = grafoDeImportaciones(INDICE);
    const rutas = modulos.map((m) => m.href.slice(RAIZ_PAQUETE.href.length));
    // No vacía: el grafo llega a la búsqueda DIVIPOL y a su tabla.
    expect(rutas).toContain("src/divipol/buscar.ts");
    expect(rutas).toContain("src/divipol/tabla.generated.ts");
    expect(rutas.filter((ruta) => ruta.startsWith("src/divipola/"))).toStrictEqual([]);
    expect(rutas.filter((ruta) => readFileSync(new URL(ruta, RAIZ_PAQUETE), "utf8").includes("CC-BY-SA"))).toStrictEqual([]);
    expect(Object.keys(principal).filter((nombre) => /divipola/i.test(nombre))).toStrictEqual([]);
  });

  it("DV-17 el recorrido detecta un módulo de divipola/ alcanzado desde la equivalencia (control positivo)", () => {
    const rutas = grafoDeImportaciones(new URL("src/divipola/index.ts", RAIZ_PAQUETE)).map((m) => m.href.slice(RAIZ_PAQUETE.href.length));
    expect(rutas).toContain("src/divipola/equivalencias.generated.ts");
    expect(rutas).toContain("src/divipol/buscar.ts");
  });

  it("DV-17 metadatos de atribución", () => {
    const sha = createHash("sha256").update(readFileSync(RUTA_DANE)).digest("hex");
    expect(DIVIPOLA_METADATOS).toStrictEqual({
      fuente: "DANE - DIVIPOLA Códigos municipios (datos.gov.co gdxc-w37w)",
      url: "https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD",
      licencia: "CC-BY-SA-4.0",
      sha256: sha,
      cambios: FUENTE_EQUIVALENCIAS.cambios,
    });
    expect(DIVIPOLA_METADATOS.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(DIVIPOLA_METADATOS.cambios).toMatch(/^Solo se conservan los códigos emparejados/);
    expect(Object.isFrozen(DIVIPOLA_METADATOS)).toBe(true);
  });

  it("DV-17 avisos de terceros publicados: files, license y exports del paquete", () => {
    const paquete = JSON.parse(readFileSync(new URL("package.json", RAIZ_PAQUETE), "utf8")) as {
      files: string[];
      license: string;
      exports: Record<string, unknown>;
    };
    expect(paquete.license).toBe("MIT AND CC-BY-SA-4.0");
    expect(paquete.files).toContain("THIRD_PARTY_NOTICES.md");
    expect(paquete.files).toContain("dist");
    expect(paquete.exports["./divipola"]).toStrictEqual({ types: "./dist/divipola/index.d.ts", default: "./dist/divipola/index.js" });
    expect(paquete.exports["."]).toStrictEqual({ types: "./dist/index.d.ts", default: "./dist/index.js" });
  });

  it("DV-17 THIRD_PARTY_NOTICES.md contiene el aviso MIT de Eitol y la atribución CC BY-SA 4.0 del DANE con cambios", () => {
    const avisos = readFileSync(new URL("THIRD_PARTY_NOTICES.md", RAIZ_PAQUETE), "utf8");
    for (const texto of [
      "Copyright (c) Hector Oliveros",
      "Permission is hereby granted, free of charge",
      "The above copyright notice and this permission notice shall be included in all",
      'THE SOFTWARE IS PROVIDED "AS IS"',
      "d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
      "Departamento Administrativo Nacional de Estadística (DANE)",
      "DIVIPOLA",
      "gdxc-w37w",
      "CC BY-SA 4.0",
      "https://creativecommons.org/licenses/by-sa/4.0/",
      SHA_DANE,
      FUENTE_EQUIVALENCIAS.cambios,
      "@lector-cedula/parsers/divipola",
    ]) {
      expect(`${texto}: ${avisos.includes(texto)}`).toBe(`${texto}: true`);
    }
  });
});
