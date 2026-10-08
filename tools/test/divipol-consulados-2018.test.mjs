// Generador de consulados DIVIPOL 2018 (cambio divipol-consulados-2018, DC-06, DC-07 y DC-09). Datos públicos:
// códigos y nombres de país del extracto de la Registraduría (datos.gov.co vh8b-jfhg), ningún dato personal.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALTERNOS_CONSULADOS_2018,
  CORRECCIONES_CONSULADOS_2018,
  ErrorDivipol,
  RENOMBRADOS_2018,
  construirConsulados2018,
  parsearConsulados2018,
  serializarConsulados2018,
} from "../divipol/divipol-lib.mjs";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const FUENTES = join(RAIZ, "tools", "divipol", "fuentes");
const MANIFIESTO = join(RAIZ, "tools", "divipol", "fuentes.json");
const SHA_2018 = "135dee55ab72b439500ebad609c825404f1d4fa6aefbf127da684fa652704724";
const URL_2018 =
  "https://www.datos.gov.co/resource/vh8b-jfhg.csv?$select=dd,mm,municipio&$group=dd,mm,municipio&$order=mm&$limit=500";
const TEXTO = readFileSync(join(FUENTES, "consulados-2018.csv"), "utf8");
const CABECERA = '"dd","mm","municipio"';

describe("DC-06 fuente registraduria-consulados-2018", () => {
  it("DC-06 Entrada del manifiesto: URL exacta, archivo, licencia y SHA-256", () => {
    const fuente = JSON.parse(readFileSync(MANIFIESTO, "utf8")).find((f) => f.id === "registraduria-consulados-2018");
    expect(fuente).toMatchObject({ url: URL_2018, sha256: SHA_2018, archivo: "consulados-2018.csv", licencia: "CC-BY-SA-4.0" });
  });

  it("DC-06 Checksum y columnas: SHA-256 recalculado y cabecera de tres columnas", () => {
    expect(createHash("sha256").update(readFileSync(join(FUENTES, "consulados-2018.csv"))).digest("hex")).toBe(SHA_2018);
    expect(TEXTO.split("\n")[0]).toBe(CABECERA);
  });

  it("DC-06 la fuente real tiene 69 filas, todas del departamento 88", () => {
    const filas = parsearConsulados2018(TEXTO);
    expect(filas).toHaveLength(69);
    expect(filas.every((f) => /^88[0-9]{3}$/.test(f.codigo))).toBe(true);
  });

  it("DC-06 Fuente con 68 filas: falla nombrando 69", () => {
    const lineas = TEXTO.trimEnd().split("\n");
    expect(() => parsearConsulados2018(lineas.slice(0, -1).join("\n") + "\n")).toThrow(/69/);
  });

  it("DC-06 cabecera distinta, columnas extra, dd distinto de 88, mm repetido o nombre vacío: ErrorDivipol", () => {
    const base = TEXTO.trimEnd().split("\n");
    const con = (i, linea) => base.map((l, j) => (j === i ? linea : l)).join("\n") + "\n";
    expect(() => parsearConsulados2018(con(0, '"dd","mm","municipio","total"'))).toThrow(ErrorDivipol);
    expect(() => parsearConsulados2018(con(1, '"88","115","GHANA","3"'))).toThrow(/línea 2/);
    expect(() => parsearConsulados2018(con(1, '"16","115","GHANA"'))).toThrow(/línea 2/);
    expect(() => parsearConsulados2018(con(1, '"88","15","GHANA"'))).toThrow(/línea 2/);
    expect(() => parsearConsulados2018(con(2, '"88","115","GHANA"'))).toThrow(/88115 repetido/);
    expect(() => parsearConsulados2018(con(1, '"88","115",""'))).toThrow(/88115/);
  });
});

describe("DC-06 bordes del parser", () => {
  it("DC-06 sin salto de línea final también da 69 filas", () => {
    expect(parsearConsulados2018(TEXTO.trimEnd())).toHaveLength(69);
  });

  it("DC-06 texto vacío: cabecera inesperada (vacía)", () => {
    expect(() => parsearConsulados2018("")).toThrow("consulados 2018: cabecera inesperada: (vacía)");
  });

  it("DC-06 mm con 4 dígitos o prefijo no numérico y nombre solo con espacios: ErrorDivipol con la línea", () => {
    const base = TEXTO.trimEnd().split("\n");
    const con = (linea) => [base[0], linea, ...base.slice(2)].join("\n");
    expect(() => parsearConsulados2018(con('"88","1150","GHANA"'))).toThrow("consulados 2018, línea 2: códigos inválidos (88, 1150)");
    expect(() => parsearConsulados2018(con('"88","x115","GHANA"'))).toThrow("consulados 2018, línea 2: códigos inválidos (88, x115)");
    expect(() => parsearConsulados2018(con('"88","115","   "'))).toThrow("consulados 2018, línea 2: nombre vacío en el código 88115");
  });
});

describe("DC-09 correcciones declaradas", () => {
  it("DC-09 corrección cuyo código falta en la fuente: mensaje con (ausente)", () => {
    const filas = parsearConsulados2018(TEXTO).filter((f) => f.codigo !== "88690");
    expect(() => construirConsulados2018(filas)).toThrow('la corrección de 88690 espera "REPUBLICA SOCIALISTA DEVIETNAM" y la fuente trae "(ausente)"');
  });

  it("DC-09 serializar con una entrada mínima: texto completo literal", () => {
    const texto = serializarConsulados2018([{ codigo: "88115", municipio: "GHANA" }], { titulo: "T", url: "U", licencia: "L", sha256: "S" });
    const cambios =
      "Extracto de las columnas dd, mm y municipio. Erratas corregidas: 88135 ARZERBAIYAN -> AZERBAIYAN; 88688 REPUBLICA DE SINGAPUR -> SINGAPUR; 88690 REPUBLICA SOCIALISTA DEVIETNAM -> VIETNAM. Códigos alternos añadidos: 88195 (alterno de 88415), 88480 (alterno de 88470).";
    expect(texto).toBe([
      "// Generado por tools/divipol/generar-divipol.mjs; no editar.",
      "// Consulados DIVIPOL 2018: material adaptado de la Registraduría Nacional del Estado Civil, CC BY-SA 4.0.",
      "// Fuente: T",
      "// URL: U",
      "// Licencia: L (https://creativecommons.org/licenses/by-sa/4.0/). Avisos en packages/parsers/THIRD_PARTY_NOTICES.md.",
      "// SHA-256: S",
      `// Cambios: ${cambios}`,
      "",
      "export const FUENTE_CONSULADOS_2018 = {",
      '  fuente: "T",',
      '  url: "U",',
      '  licencia: "L",',
      '  sha256: "S",',
      `  cambios: ${JSON.stringify(cambios)},`,
      "} as const;",
      "",
      'export const RENOMBRADOS_2018_GENERADO: readonly string[] = ["88140","88160","88370","88435"];',
      "",
      "/** Filas [código de 5 dígitos, consulado] en orden de código. */",
      "export const FILAS_CONSULADOS_2018: readonly (readonly [string, string])[] = [",
      '  ["88115","GHANA"],',
      "];",
      "",
    ].join("\n"));
  });

  it("DC-09 tabla literal de correcciones", () => {
    expect(CORRECCIONES_CONSULADOS_2018).toStrictEqual([
      { codigo: "88135", original: "ARZERBAIYAN", corregido: "AZERBAIYAN" },
      { codigo: "88688", original: "REPUBLICA DE SINGAPUR", corregido: "SINGAPUR" },
      { codigo: "88690", original: "REPUBLICA SOCIALISTA DEVIETNAM", corregido: "VIETNAM" },
    ]);
  });

  it("DC-09 Corrección que ya no aplica: falla nombrando 88135", () => {
    const filas = parsearConsulados2018(TEXTO).map((f) => (f.codigo === "88135" ? { ...f, municipio: "AZERBAIYAN" } : f));
    expect(() => construirConsulados2018(filas)).toThrow(/88135/);
  });

  it("DC-09 y DC-04 construir: 71 filas ordenadas, correcciones aplicadas y alternos de Belice e Irlanda", () => {
    const filas = construirConsulados2018(parsearConsulados2018(TEXTO));
    const mapa = new Map(filas.map((f) => [f.codigo, f.municipio]));
    expect(filas).toHaveLength(71);
    expect(filas.map((f) => f.codigo)).toStrictEqual([...mapa.keys()].sort());
    expect([mapa.get("88135"), mapa.get("88688"), mapa.get("88690")]).toStrictEqual(["AZERBAIYAN", "SINGAPUR", "VIETNAM"]);
    expect([mapa.get("88195"), mapa.get("88415"), mapa.get("88480"), mapa.get("88470")]).toStrictEqual(["BELICE", "BELICE", "IRLANDA", "IRLANDA"]);
    expect(ALTERNOS_CONSULADOS_2018).toStrictEqual({ "88195": "88415", "88480": "88470" });
    expect(RENOMBRADOS_2018).toStrictEqual(["88140", "88160", "88370", "88435"]);
  });

  it("DC-04 alterno cuyo destino falta en la fuente o ya presente: ErrorDivipol", () => {
    const filas = parsearConsulados2018(TEXTO);
    expect(() => construirConsulados2018(filas.filter((f) => f.codigo !== "88415"))).toThrow(/88415/);
    expect(() => construirConsulados2018([...filas, { codigo: "88195", municipio: "BELICE" }])).toThrow(/88195/);
  });

  it("DC-03 renombrado ausente de la fuente: ErrorDivipol", () => {
    const filas = parsearConsulados2018(TEXTO).filter((f) => f.codigo !== "88140");
    expect(() => construirConsulados2018(filas)).toThrow(/88140/);
  });

  it("DC-09 serializar: cabecera de atribución con cada cambio, filas compactas y LF final", () => {
    const filas = construirConsulados2018(parsearConsulados2018(TEXTO));
    const texto = serializarConsulados2018(filas, { titulo: "T", url: URL_2018, licencia: "CC-BY-SA-4.0", sha256: SHA_2018 });
    expect(texto.endsWith("\n")).toBe(true);
    expect(texto.includes("\r")).toBe(false);
    for (const c of CORRECCIONES_CONSULADOS_2018) expect(texto).toContain(`${c.codigo} ${c.original} -> ${c.corregido}`);
    expect(texto).toContain('  ["88690","VIETNAM"],');
    expect(texto).toContain('export const RENOMBRADOS_2018_GENERADO: readonly string[] = ["88140","88160","88370","88435"];');
    expect(texto.split("\n").filter((l) => l.startsWith('  ["88'))).toHaveLength(71);
  });
});
