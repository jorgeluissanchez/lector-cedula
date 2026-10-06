// Integridad de la tabla DIVIPOL generada (cambio divipol-registraduria, requisitos DV-10 y DV-11).
// Oráculo independiente del generador: los conteos, nombres y checksums son los literales de la spec, y el
// SHA-256 de la instantánea se recalcula con node:crypto. Códigos y nombres de lugar: datos públicos.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEPARTAMENTOS_DIVIPOL, FILAS_DIVIPOL, FUENTE_TABLA_DIVIPOL } from "../src/divipol/tabla.generated.js";

const SHA_LOCALITIES = "56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1";
const RUTA_TABLA = new URL("../src/divipol/tabla.generated.ts", import.meta.url);
const RUTA_INSTANTANEA = new URL("../../../tools/divipol/fuentes/localities.py", import.meta.url);

// DV-10, escenario "Conteo por departamento".
const CONTEOS: Record<string, number> = {
  "01": 125, "03": 23, "05": 46, "07": 123, "09": 27, "11": 42, "12": 25, "13": 30, "15": 117, "16": 1, "17": 30,
  "19": 37, "21": 30, "23": 64, "24": 14, "25": 40, "26": 12, "27": 87, "28": 26, "29": 47, "31": 42, "40": 7,
  "44": 16, "46": 19, "48": 15, "50": 9, "52": 29, "54": 4, "56": 2, "60": 11, "64": 13, "68": 6, "72": 4, "88": 67,
};

// DV-10, escenario "Nombres de departamento".
const NOMBRES: Record<string, string> = {
  "01": "ANTIOQUIA", "03": "ATLANTICO", "05": "BOLIVAR", "07": "BOYACA", "09": "CALDAS", "11": "CAUCA",
  "12": "CESAR", "13": "CORDOBA", "15": "CUNDINAMARCA", "16": "BOGOTA D.C", "17": "CHOCO", "19": "HUILA",
  "21": "MAGDALENA", "23": "NARIÑO", "24": "RISARALDA", "25": "NORTE DE SANTANDER", "26": "QUINDIO",
  "27": "SANTANDER", "28": "SUCRE", "29": "TOLIMA", "31": "VALLE", "40": "ARAUCA", "44": "CAQUETA",
  "46": "CASANARE", "48": "LA GUAJIRA", "50": "GUAINIA", "52": "META", "54": "GUAVIARE", "56": "SAN ANDRES",
  "60": "AMAZONAS", "64": "PUTUMAYO", "68": "VAUPES", "72": "VICHADA", "88": "CONSULADOS",
};

function ordenadas(entradas: [string, number | string][]): [string, number | string][] {
  return [...entradas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

describe("tabla DIVIPOL generada (DV-10)", () => {
  const codigos = FILAS_DIVIPOL.map(([codigo]) => codigo);
  const departamentoDe = (codigo: string): string => codigo.slice(0, 2);

  it("DV-10 número de filas y departamentos: 1190 filas, 1190 códigos, 34 departamentos, 1123 municipios y 67 consulados", () => {
    expect(FILAS_DIVIPOL.length).toBe(1190);
    expect(new Set(codigos).size).toBe(1190);
    expect(new Set(codigos.map(departamentoDe)).size).toBe(34);
    expect(Object.keys(DEPARTAMENTOS_DIVIPOL).length).toBe(34);
    expect(codigos.filter((c) => departamentoDe(c) !== "88").length).toBe(1123);
    expect(codigos.filter((c) => departamentoDe(c) === "88").length).toBe(67);
  });

  it("DV-10 todo código tiene 5 dígitos ASCII y las filas van en orden estricto de código", () => {
    for (const codigo of codigos) expect(codigo).toMatch(/^[0-9]{5}$/);
    expect(codigos).toStrictEqual([...codigos].sort());
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("DV-10 conteo por departamento igual a la tabla literal de la spec", () => {
    const conteos: Record<string, number> = {};
    for (const codigo of codigos) conteos[departamentoDe(codigo)] = (conteos[departamentoDe(codigo)] ?? 0) + 1;
    expect(ordenadas(Object.entries(conteos))).toStrictEqual(ordenadas(Object.entries(CONTEOS)));
  });

  it("DV-10 nombres de departamento iguales a la tabla literal de la spec, con Ñ como U+00D1", () => {
    expect(ordenadas(Object.entries(DEPARTAMENTOS_DIVIPOL))).toStrictEqual(ordenadas(Object.entries(NOMBRES)));
    expect([...(DEPARTAMENTOS_DIVIPOL["23"] ?? "")].map((c) => c.codePointAt(0))).toStrictEqual([0x4e, 0x41, 0x52, 0x49, 0xd1, 0x4f]);
  });

  it("DV-10 único duplicado documentado: BOGOTA, D.C. solo en 15001 y 16001, y ningún par departamento-municipio se repite", () => {
    expect(FILAS_DIVIPOL.filter(([, municipio]) => municipio === "BOGOTA, D.C.").map(([codigo]) => codigo)).toStrictEqual(["15001", "16001"]);
    const pares = FILAS_DIVIPOL.map(([codigo, municipio]) => `${departamentoDe(codigo)}|${municipio}`);
    const repetidos = pares.filter((par, i) => pares.indexOf(par) !== i);
    expect(repetidos).toStrictEqual([]);
  });

  it("DV-10 caracteres de los nombres: sin / ni U+2010, sin espacios en los extremos y solo el alfabeto permitido", () => {
    const nombres = [...Object.values(DEPARTAMENTOS_DIVIPOL), ...FILAS_DIVIPOL.map(([, municipio]) => municipio)];
    expect(nombres.length).toBe(34 + 1190);
    const fuera = nombres.filter(
      (n) => !/^[A-Z0-9 \u00D1.,()-]+$/.test(n) || n !== n.trim() || n.includes("/") || n.includes("\u2010"),
    );
    expect(fuera).toStrictEqual([]);
    // La propiedad no es vacía: la fuente trae 23 municipios con "/" (Ñ corrupta) y 4 nombres con U+2010.
    expect(FILAS_DIVIPOL.filter(([, municipio]) => municipio.includes("\u00D1"))).toHaveLength(23);
    expect(FILAS_DIVIPOL.find(([codigo]) => codigo === "01062")).toStrictEqual(["01062", "BRICEÑO"]);
    expect(FILAS_DIVIPOL.find(([codigo]) => codigo === "01168")).toStrictEqual(["01168", "PUERTO NARE-LA MAGDALENA"]);
    expect(FILAS_DIVIPOL.find(([codigo]) => codigo === "88355")).toStrictEqual(["88355", "ESPAÑA"]);
  });
});

describe("trazabilidad de la tabla generada (DV-11)", () => {
  it("DV-11 el SHA-256 de la instantánea es el literal de la spec y coincide con la cabecera y los metadatos de la fuente", () => {
    const calculado = createHash("sha256").update(readFileSync(RUTA_INSTANTANEA)).digest("hex");
    const cabecera = /^\/\/ SHA-256: ([0-9a-f]{64})$/m.exec(readFileSync(RUTA_TABLA, "utf8"))?.[1];
    expect(calculado).toBe(SHA_LOCALITIES);
    expect(cabecera).toBe(SHA_LOCALITIES);
    expect(FUENTE_TABLA_DIVIPOL).toStrictEqual({
      fuente: "Eitol/colombian-cedula-reader",
      commit: "d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
      ruta: "src/barcode/localities.py",
      licencia: "MIT",
      sha256: SHA_LOCALITIES,
    });
  });

  it("DV-11 la cabecera declara que es generado, la fuente, el commit, la ruta y la licencia", () => {
    const lineas = readFileSync(RUTA_TABLA, "utf8").split("\n").slice(0, 7);
    expect(lineas.slice(0, 4)).toStrictEqual([
      "// Generado por tools/divipol/generar-divipol.mjs; no editar.",
      "// Fuente: Eitol/colombian-cedula-reader",
      "// Commit: d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
      "// Ruta: src/barcode/localities.py",
    ]);
    expect(lineas[4]).toMatch(/^\/\/ Licencia: MIT\. /);
  });
});
