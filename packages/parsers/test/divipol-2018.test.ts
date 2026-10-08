// Consulados DIVIPOL 2018 (cambio divipol-consulados-2018, DC-01 a DC-05 y DC-07). Literales de la spec como
// oráculo; la tabla principal (Eitol) es el oráculo independiente de los conteos. Datos públicos, ningún dato personal.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buscarDivipol } from "../src/index.js";
import { FILAS_DIVIPOL } from "../src/divipol/tabla.generated.js";
import { buscarConsulado2018, DIVIPOL_2018_METADATOS, RENOMBRADOS_2018 } from "../src/divipol-2018/index.js";
import { FILAS_CONSULADOS_2018 } from "../src/divipol-2018/consulados.generated.js";

const RAIZ_PAQUETE = new URL("../", import.meta.url);
const SHA_2018 = "135dee55ab72b439500ebad609c825404f1d4fa6aefbf127da684fa652704724";
const URL_2018 =
  "https://www.datos.gov.co/resource/vh8b-jfhg.csv?$select=dd,mm,municipio&$group=dd,mm,municipio&$order=mm&$limit=500";

const NUEVOS: Record<string, string> = {
  "88115": "GHANA", "88130": "ARGELIA", "88135": "AZERBAIYAN", "88350": "EMIRATOS ARABES UNIDOS", "88415": "BELICE",
  "88470": "IRLANDA", "88540": "LUXEMBURGO", "88625": "NUEVA ZELANDIA", "88688": "SINGAPUR", "88690": "VIETNAM",
  "88765": "TAILANDIA",
};
const VIGENTES: Record<string, string> = {
  "88140": "CURAZAO", "88160": "ARUBA", "88370": "REPUBLICA DE FILIPINAS", "88435": "PAISES BAJOS",
};
const HISTORICOS: Record<string, string> = {
  "88140": "PAISES BAJ-ANTILLAS HOLANDESAS", "88160": "PAISES BAJOS - ARUBA", "88370": "FILIPINAS", "88435": "HOLANDA",
};

function encontrado(codigo: string, municipio: string): unknown {
  return {
    encontrado: true, codigo, codigoDepartamento: "88", codigoMunicipio: codigo.slice(2), departamento: "CONSULADOS",
    municipio, tipo: "consulado", warnings: ["D03"],
  };
}

function grafoDeImportaciones(entrada: URL): string[] {
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
  return [...visitados.values()].map((m) => m.href.slice(RAIZ_PAQUETE.href.length));
}

/** Grafo del compilado (`dist/*.js`): mismos especificadores relativos, sin reescribir la extensión. */
function grafoCompilado(entrada: URL): string[] {
  const relativas = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g;
  const visitados = new Map<string, URL>();
  const pendientes = [entrada];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as URL;
    if (visitados.has(actual.href)) continue;
    visitados.set(actual.href, actual);
    for (const [, especificador] of readFileSync(actual, "utf8").matchAll(relativas)) {
      const destino = new URL(especificador ?? "", actual);
      pendientes.push(existsSync(destino) ? destino : new URL(`${destino.href}/index.js`));
    }
  }
  return [...visitados.values()].map((m) => m.href.slice(RAIZ_PAQUETE.href.length));
}

describe("DC-11 el principal sigue libre de datos CC BY-SA (DV-17)", () => {
  it("DC-11 Grafo del fuente", () => {
    const rutas = grafoDeImportaciones(new URL("src/index.ts", RAIZ_PAQUETE));
    expect(rutas.length).toBeGreaterThan(3);
    expect(rutas.filter((r) => r.startsWith("src/divipola/") || r.startsWith("src/divipol-2018/"))).toStrictEqual([]);
  });

  it("DC-11 Grafo del compilado", () => {
    const rutas = grafoCompilado(new URL("dist/index.js", RAIZ_PAQUETE));
    expect(rutas).toContain("dist/divipol/tabla.generated.js");
    expect(rutas.filter((r) => r.startsWith("dist/divipola/") || r.startsWith("dist/divipol-2018/"))).toStrictEqual([]);
    expect(readFileSync(new URL("dist/index.js", RAIZ_PAQUETE), "utf8")).not.toContain("88195");
    expect(rutas.filter((r) => readFileSync(new URL(r, RAIZ_PAQUETE), "utf8").includes("AZERBAIYAN"))).toStrictEqual([]);
  });

  it("DC-11 el detector sí ve el módulo 2018 desde su propio punto de entrada", () => {
    const rutas = grafoCompilado(new URL("dist/divipol-2018/index.js", RAIZ_PAQUETE));
    expect(rutas.some((r) => readFileSync(new URL(r, RAIZ_PAQUETE), "utf8").includes("AZERBAIYAN"))).toBe(true);
  });
});

describe("DC-01 punto de entrada separado", () => {
  it("DC-01 Exportación declarada", () => {
    const paquete = JSON.parse(readFileSync(new URL("package.json", RAIZ_PAQUETE), "utf8"));
    expect(paquete.exports["./divipol-2018"]).toStrictEqual({ types: "./dist/divipol-2018/index.d.ts", default: "./dist/divipol-2018/index.js" });
  });

  it("DC-01 El principal no alcanza el módulo 2018", () => {
    const rutas = grafoDeImportaciones(new URL("src/index.ts", RAIZ_PAQUETE));
    expect(rutas).toContain("src/divipol/tabla.generated.ts");
    expect(rutas.filter((r) => r.startsWith("src/divipol-2018/"))).toStrictEqual([]);
    expect(rutas.filter((r) => readFileSync(new URL(r, RAIZ_PAQUETE), "utf8").includes("CC-BY-SA"))).toStrictEqual([]);
  });

  it("DC-01 Tabla principal intacta", () => {
    expect(FILAS_DIVIPOL).toHaveLength(1190);
    expect(FILAS_DIVIPOL.filter(([c]) => c.startsWith("88"))).toHaveLength(67);
    expect(buscarDivipol("88115")).toStrictEqual({ encontrado: false, codigo: "88115", motivo: "desconocido", warnings: ["D01"] });
  });

  it("DC-01 Metadatos de atribución", () => {
    const instantanea = readFileSync(new URL("../../tools/divipol/fuentes/consulados-2018.csv", RAIZ_PAQUETE));
    expect(createHash("sha256").update(instantanea).digest("hex")).toBe(SHA_2018);
    expect(DIVIPOL_2018_METADATOS).toMatchObject({
      fuente: "Registraduría Nacional del Estado Civil - Divipole Exterior Presidente 2018 (datos.gov.co vh8b-jfhg)",
      licencia: "CC-BY-SA-4.0", url: URL_2018, sha256: SHA_2018, filas: 71,
    });
    for (const fragmento of ["88135 ARZERBAIYAN -> AZERBAIYAN", "88688 REPUBLICA DE SINGAPUR -> SINGAPUR", "88690 REPUBLICA SOCIALISTA DEVIETNAM -> VIETNAM"]) {
      expect(DIVIPOL_2018_METADATOS.cambios).toContain(fragmento);
    }
    expect(Object.isFrozen(DIVIPOL_2018_METADATOS)).toBe(true);
  });
});

describe("DC-02 a DC-04 búsqueda", () => {
  it("DC-02 Los 11 consulados nuevos", () => {
    for (const [codigo, municipio] of Object.entries(NUEVOS)) expect(buscarConsulado2018(codigo)).toStrictEqual(encontrado(codigo, municipio));
  });

  it("DC-02 Resultado completo", () => {
    expect(buscarConsulado2018("88115")).toStrictEqual({
      encontrado: true, codigo: "88115", codigoDepartamento: "88", codigoMunicipio: "115", departamento: "CONSULADOS",
      municipio: "GHANA", tipo: "consulado", warnings: ["D03"],
    });
  });

  it("DC-03 Nombres vigentes y lista de renombrados", () => {
    for (const [codigo, municipio] of Object.entries(VIGENTES)) expect(buscarConsulado2018(codigo)).toStrictEqual(encontrado(codigo, municipio));
    expect(RENOMBRADOS_2018).toStrictEqual(["88140", "88160", "88370", "88435"]);
  });

  it("DC-03 El principal conserva el nombre histórico", () => {
    for (const [codigo, municipio] of Object.entries(HISTORICOS)) expect(buscarDivipol(codigo)).toMatchObject({ encontrado: true, municipio });
  });

  it("DC-04 Ambos códigos de Belice e Irlanda", () => {
    expect(["88195", "88415", "88480", "88470"].map((c) => buscarConsulado2018(c))).toStrictEqual([
      encontrado("88195", "BELICE"), encontrado("88415", "BELICE"), encontrado("88480", "IRLANDA"), encontrado("88470", "IRLANDA"),
    ]);
  });
});

describe("DC-05 función pura y total", () => {
  const INVALIDO = { encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] };

  it("DC-05 Formato inválido", () => {
    for (const entrada of ["8811", 88115, null, "88 15", "188115", "881151"]) expect(buscarConsulado2018(entrada)).toStrictEqual(INVALIDO);
  });

  it("DC-05 Código fuera de la tabla", () => {
    for (const codigo of ["88300", "01001"]) {
      expect(buscarConsulado2018(codigo)).toStrictEqual({ encontrado: false, codigo, motivo: "desconocido", warnings: [] });
    }
  });

  it("DC-05 objetos y arreglos nuevos en cada llamada", () => {
    const a = buscarConsulado2018("88115");
    const b = buscarConsulado2018("88115");
    expect(a).not.toBe(b);
    expect(a.warnings).not.toBe(b.warnings);
    a.warnings.push("X");
    expect(buscarConsulado2018("88115").warnings).toStrictEqual(["D03"]);
  });

  it("DC-05 Recorrido exhaustivo: 71 encontrados, todos del departamento 88", () => {
    const encontrados: string[] = [];
    const malos: string[] = [];
    for (let i = 0; i < 100_000; i++) {
      const codigo = String(i).padStart(5, "0");
      const r = buscarConsulado2018(codigo);
      if (r.encontrado) encontrados.push(codigo);
      else if (r.codigo !== codigo || r.motivo !== "desconocido" || r.warnings.length !== 0) malos.push(codigo);
    }
    expect(malos).toStrictEqual([]);
    expect(encontrados).toHaveLength(71);
    expect(encontrados.every((c) => c.startsWith("88"))).toBe(true);
  });

  it("DC-05 fuzz: nunca lanza con fc.anything, fc.string y cadenas binarias", () => {
    for (const arb of [fc.anything(), fc.string(), fc.string({ unit: "binary" })]) {
      fc.assert(fc.property(arb, (x) => { buscarConsulado2018(x); }), { numRuns: 1000 });
    }
  });
});

describe("DC-07 integridad frente a la tabla principal", () => {
  it("DC-07 Conteos: 71 filas, 11 ausentes del principal, 4 renombres, 56 idénticas", () => {
    const principal = new Map(FILAS_DIVIPOL);
    expect(FILAS_CONSULADOS_2018).toHaveLength(71);
    const ausentes = FILAS_CONSULADOS_2018.filter(([c]) => !principal.has(c)).map(([c]) => c);
    const distintos = FILAS_CONSULADOS_2018.filter(([c, n]) => principal.has(c) && principal.get(c) !== n).map(([c]) => c);
    const iguales = FILAS_CONSULADOS_2018.filter(([c, n]) => principal.get(c) === n).map(([c]) => c);
    expect(ausentes).toStrictEqual(Object.keys(NUEVOS).sort());
    expect(distintos).toStrictEqual([...RENOMBRADOS_2018]);
    expect(iguales).toHaveLength(56);
    expect(iguales).toContain("88195");
    expect(iguales).toContain("88480");
    expect(FILAS_CONSULADOS_2018.every(([c]) => c.startsWith("88"))).toBe(true);
  });
});
