// Unitarias, propiedades e integridad de tools/divipol/divipol-lib.mjs (cambio divipol-registraduria,
// design.md decisiones 7 y 8; requisitos DV-11, DV-12 y DV-14). Datos públicos o sintéticos: códigos y
// nombres de lugar, ningún dato personal.
import { createHash } from "node:crypto";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAMBIOS_EQUIVALENCIAS,
  DEPARTAMENTOS_DANE,
  ErrorDivipol,
  emparejar,
  normalizar,
  normalizarSinParentesis,
  parsearDivipola,
  parsearLocalities,
  serializarEquivalencias,
  serializarTabla,
  sha256,
  transformarNombre,
  verificarFuente,
} from "../divipol/divipol-lib.mjs";

const SHA_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA_LOCALITIES = "56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1";
const SHA_DANE = "159b4b84595a11be5bf623fdf25c6fd5c9ac8c3ed898cf7928b2b3f321b9b492";

describe("sha256 y verificarFuente (DV-12)", () => {
  it("DV-12 checksum de abc", () => {
    expect(sha256(Buffer.from("abc", "latin1"))).toBe(SHA_ABC);
  });

  it("DV-12 checksum de la entrada vacía y de bytes no ASCII", () => {
    expect(sha256(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const bytes = Uint8Array.from([0x00, 0xd1, 0xff, 0x0a]);
    expect(sha256(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("DV-12 verificarFuente acepta el checksum correcto y no lanza", () => {
    expect(() => verificarFuente(Buffer.from("abc"), SHA_ABC, "sintetica")).not.toThrow();
  });

  it("DV-12 verificarFuente acepta el checksum esperado en mayúsculas", () => {
    expect(() => verificarFuente(Buffer.from("abc"), SHA_ABC.toUpperCase(), "sintetica")).not.toThrow();
  });

  it("DV-12 checksum distinto: ErrorDivipol con la fuente y ambos checksums", () => {
    let error;
    try {
      verificarFuente(Buffer.from("abc"), SHA_LOCALITIES, "eitol-localities");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ErrorDivipol");
    expect(error.message).toContain("eitol-localities");
    expect(error.message).toContain(SHA_ABC);
    expect(error.message).toContain(SHA_LOCALITIES);
  });
});

describe("instantáneas versionadas de las fuentes (DV-11, DV-12)", () => {
  const RAIZ_DIVIPOL = fileURLToPath(new URL("../divipol/", import.meta.url));
  const manifiesto = () => JSON.parse(readFileSync(join(RAIZ_DIVIPOL, "fuentes.json"), "utf8"));

  it("DV-11 el manifiesto fija las dos fuentes con las URLs, licencias y SHA-256 del diseño", () => {
    const fuentes = manifiesto();
    expect(fuentes.map((f) => [f.id, f.url, f.sha256, f.licencia, f.archivo])).toStrictEqual([
      [
        "eitol-localities",
        "https://raw.githubusercontent.com/Eitol/colombian-cedula-reader/d72a342deb7255ca49cafe16bb3f8c0b6e54869a/src/barcode/localities.py",
        SHA_LOCALITIES,
        "MIT",
        "localities.py",
      ],
      [
        "dane-divipola",
        "https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD",
        SHA_DANE,
        "CC-BY-SA-4.0",
        "divipola-dane.csv",
      ],
    ]);
    for (const f of fuentes) expect(typeof f.atribucion === "string" && f.atribucion.length > 0).toBe(true);
  });

  it("DV-11 el SHA-256 de cada instantánea, recalculado con node:crypto, es el literal del manifiesto", () => {
    for (const fuente of manifiesto()) {
      const bytes = readFileSync(join(RAIZ_DIVIPOL, "fuentes", fuente.archivo));
      expect(`${fuente.id} ${createHash("sha256").update(bytes).digest("hex")}`).toBe(`${fuente.id} ${fuente.sha256}`);
    }
  });

  it("DV-11 LICENSES.md de las fuentes contiene el aviso MIT de Eitol y la atribución CC BY-SA 4.0 del DANE", () => {
    const avisos = readFileSync(join(RAIZ_DIVIPOL, "fuentes", "LICENSES.md"), "utf8");
    expect(avisos).toContain("Copyright (c) Hector Oliveros");
    expect(avisos).toContain("Permission is hereby granted, free of charge");
    expect(avisos).toContain("THE SOFTWARE IS PROVIDED \"AS IS\"");
    expect(avisos).toContain("Departamento Administrativo Nacional de Estadística (DANE)");
    expect(avisos).toContain("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(avisos).toContain("gdxc-w37w");
  });
});

const GUION_TIPOGRAFICO = String.fromCharCode(0x2010);
const ENE = String.fromCharCode(0x00d1);

/** Fuente sintética con la forma de localities.py: cabecera, comentario, filas y cierre. */
function fuenteSintetica(...filas) {
  return ["LOCALITIES = [", "    # mun | dep  |   mun     | dep", ...filas, "]", ""].join("\n");
}

function capturarError(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("se esperaba un ErrorDivipol");
}

describe("transformarNombre (DV-14)", () => {
  it("DV-14 Ñ restaurada: BRICE/O -> BRICEÑO con U+00D1", () => {
    const nombre = transformarNombre("BRICE/O");
    expect(nombre).toBe("BRICEÑO");
    expect(nombre).toBe(`BRICE${ENE}O`);
    expect([...nombre].map((c) => c.codePointAt(0))).toStrictEqual([0x42, 0x52, 0x49, 0x43, 0x45, 0xd1, 0x4f]);
  });

  it("DV-14 guion tipográfico U+2010 normalizado a U+002D", () => {
    expect(transformarNombre(`PUERTO NARE${GUION_TIPOGRAFICO}LA MAGDALENA`)).toBe("PUERTO NARE-LA MAGDALENA");
  });

  it("DV-14 recorta espacios en los extremos y conserva los internos", () => {
    expect(transformarNombre("  SAN  PEDRO ")).toBe("SAN  PEDRO");
  });

  it("DV-14 copia literal cualquier otro valor (sin tildes ni otros cambios)", () => {
    expect(transformarNombre("BOGOTA D.C")).toBe("BOGOTA D.C");
    expect(transformarNombre("PATIA (EL BORDO)")).toBe("PATIA (EL BORDO)");
    expect(transformarNombre("medellín\\")).toBe("medellín\\");
  });

  it("DV-14 propiedad: sin / ni U+2010, misma longitud tras recorte, carácter a carácter e idempotente", () => {
    const comunes = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ "];
    const todos = fc.constantFrom(...comunes, "/", GUION_TIPOGRAFICO);
    // Válido por construcción: siempre hay al menos un carácter a transformar.
    const nombre = fc
      .tuple(fc.string({ unit: todos }), fc.constantFrom("/", GUION_TIPOGRAFICO), fc.string({ unit: todos }))
      .map(([a, especial, b]) => a + especial + b);
    const esperado = { "/": ENE, [GUION_TIPOGRAFICO]: "-" };
    fc.assert(
      fc.property(nombre, (entrada) => {
        const salida = transformarNombre(entrada);
        const recortada = entrada.trim();
        expect(salida.includes("/")).toBe(false);
        expect(salida.includes(GUION_TIPOGRAFICO)).toBe(false);
        expect(salida.length).toBe(recortada.length);
        for (let i = 0; i < recortada.length; i++) expect(salida[i]).toBe(esperado[recortada[i]] ?? recortada[i]);
        expect(transformarNombre(salida)).toBe(salida);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("parsearLocalities (DV-14)", () => {
  it("DV-14 Ñ restaurada en la fila de la fuente", () => {
    expect(parsearLocalities(fuenteSintetica("    ['01', '062', 'ANTIOQUIA', 'BRICE/O'],"))).toStrictEqual([
      { codigo: "01062", departamento: "ANTIOQUIA", municipio: `BRICE${ENE}O` },
    ]);
  });

  it("DV-14 guion tipográfico normalizado en la fila de la fuente", () => {
    const texto = fuenteSintetica(`    ['01', '168', 'ANTIOQUIA', 'PUERTO NARE${GUION_TIPOGRAFICO}LA MAGDALENA'],`);
    expect(parsearLocalities(texto)).toStrictEqual([
      { codigo: "01168", departamento: "ANTIOQUIA", municipio: "PUERTO NARE-LA MAGDALENA" },
    ]);
  });

  it("DV-14 transforma también el nombre de departamento y admite la última fila sin coma y CRLF", () => {
    const texto = ["LOCALITIES = [", "    ['23', '001', 'NARI/O', 'PASTO'],", "    ['01', '001', 'ANTIOQUIA', 'MEDELLIN']", "]", ""].join("\r\n");
    expect(parsearLocalities(texto)).toStrictEqual([
      { codigo: "23001", departamento: `NARI${ENE}O`, municipio: "PASTO" },
      { codigo: "01001", departamento: "ANTIOQUIA", municipio: "MEDELLIN" },
    ]);
  });

  it("DV-14 fila malformada (municipio de 2 dígitos): ErrorDivipol con el número de línea", () => {
    const texto = fuenteSintetica("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '06', 'ANTIOQUIA', 'X'],");
    const error = capturarError(() => parsearLocalities(texto));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("línea 4");
  });

  it("DV-14 filas con otra forma también abortan con su número de línea", () => {
    const malas = [
      "    ['01', '001', 'ANTIOQUIA'],",
      "    ['01', '001', 'ANTIOQUIA', 'MEDELLIN', 'X'],",
      "    ['1', '001', 'ANTIOQUIA', 'MEDELLIN'],",
      "    ['01', '0010', 'ANTIOQUIA', 'MEDELLIN'],",
      "    ['0A', '001', 'ANTIOQUIA', 'MEDELLIN'],",
      "    [\"01\", \"001\", \"ANTIOQUIA\", \"MEDELLIN\"],",
      "    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'], ['01', '004', 'ANTIOQUIA', 'ABEJORRAL'],",
      "    ['01', '001', 'ANTIOQUIA', '   '],",
      "    ['01', '001', '', 'MEDELLIN'],",
      "OTRA = 1",
    ];
    for (const mala of malas) {
      const error = capturarError(() => parsearLocalities(fuenteSintetica(mala)));
      expect(`${mala} -> ${error.name}: ${error.message.includes("línea 3")}`).toBe(`${mala} -> ErrorDivipol: true`);
    }
  });

  it("DV-14 código repetido en la fuente: ErrorDivipol con 01001", () => {
    const texto = fuenteSintetica("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '001', 'ANTIOQUIA', 'OTRO'],");
    const error = capturarError(() => parsearLocalities(texto));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("01001");
    expect(error.message).toContain("línea 4");
  });

  it("DV-10 un departamento con dos nombres distintos aborta con su código", () => {
    const texto = fuenteSintetica("    ['01', '001', 'ANTIOQUIA', 'MEDELLIN'],", "    ['01', '004', 'ANTIOQUIA2', 'ABEJORRAL'],");
    const error = capturarError(() => parsearLocalities(texto));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("01");
    expect(error.message).toContain("ANTIOQUIA2");
  });

  it("DV-14 una fuente sin filas aborta", () => {
    expect(capturarError(() => parsearLocalities(fuenteSintetica()))).toBeInstanceOf(ErrorDivipol);
  });

  it("DV-11 la instantánea fijada da 1190 filas, con BRICEÑO en 01062", () => {
    const filas = parsearLocalities(readFileSync(fileURLToPath(new URL("../divipol/fuentes/localities.py", import.meta.url)), "utf8"));
    expect(filas.length).toBe(1190);
    expect(filas.find((f) => f.codigo === "01062")).toStrictEqual({ codigo: "01062", departamento: "ANTIOQUIA", municipio: `BRICE${ENE}O` });
  });
});

describe("serializarTabla (DV-11, DV-13)", () => {
  const META = {
    repositorio: "Eitol/colombian-cedula-reader",
    commit: "d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
    ruta: "src/barcode/localities.py",
    licencia: "MIT",
    sha256: SHA_LOCALITIES,
  };
  const FILAS = [
    { codigo: "88815", departamento: "CONSULADOS", municipio: "VENEZUELA" },
    { codigo: "01062", departamento: "ANTIOQUIA", municipio: `BRICE${ENE}O` },
    { codigo: "01001", departamento: "ANTIOQUIA", municipio: "MEDELLIN" },
    { codigo: "23001", departamento: `NARI${ENE}O`, municipio: "PASTO" },
  ];

  it("DV-11 DV-13 salida exacta: cabecera trazable, departamentos y filas compactas en orden de código", () => {
    expect(serializarTabla(FILAS, META)).toBe(
      [
        "// Generado por tools/divipol/generar-divipol.mjs; no editar.",
        "// Fuente: Eitol/colombian-cedula-reader",
        "// Commit: d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
        "// Ruta: src/barcode/localities.py",
        "// Licencia: MIT. Aviso completo en packages/parsers/THIRD_PARTY_NOTICES.md y tools/divipol/fuentes/LICENSES.md.",
        `// SHA-256: ${SHA_LOCALITIES}`,
        "// Transformaciones (DV-14): / por U+00D1, U+2010 por -, recorte de espacios en los extremos.",
        "",
        "export const FUENTE_TABLA_DIVIPOL = {",
        '  fuente: "Eitol/colombian-cedula-reader",',
        '  commit: "d72a342deb7255ca49cafe16bb3f8c0b6e54869a",',
        '  ruta: "src/barcode/localities.py",',
        '  licencia: "MIT",',
        `  sha256: "${SHA_LOCALITIES}",`,
        "} as const;",
        "",
        "/** Código de departamento (2 dígitos) -> nombre. */",
        "export const DEPARTAMENTOS_DIVIPOL: Readonly<Record<string, string>> = {",
        '  "01": "ANTIOQUIA",',
        `  "23": "NARI${ENE}O",`,
        '  "88": "CONSULADOS",',
        "};",
        "",
        "/** Filas [código de 5 dígitos, municipio] en orden de código. */",
        "export const FILAS_DIVIPOL: readonly (readonly [string, string])[] = [",
        '  ["01001","MEDELLIN"],',
        `  ["01062","BRICE${ENE}O"],`,
        '  ["23001","PASTO"],',
        '  ["88815","VENEZUELA"],',
        "];",
        "",
      ].join("\n"),
    );
  });

  it("DV-13 no depende del orden de entrada ni modifica el arreglo recibido", () => {
    const copia = structuredClone(FILAS);
    const invertidas = [...FILAS].reverse();
    expect(serializarTabla(invertidas, META)).toBe(serializarTabla(FILAS, META));
    expect(FILAS).toStrictEqual(copia);
  });

  it("DV-13 escapa comillas y barras invertidas de los nombres como cadenas JSON", () => {
    const salida = serializarTabla([{ codigo: "01001", departamento: 'A"B', municipio: "C\\D" }], META);
    expect(salida).toContain('  "01": "A\\"B",');
    expect(salida).toContain('  ["01001","C\\\\D"],');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Equivalencia DIVIPOL -> DIVIPOLA (DV-16). Fuentes sintéticas pequeñas; la instantánea real del DANE solo se lee
// para comprobar su integridad (1122 filas, 33 departamentos).

const RAIZ_FUENTES = fileURLToPath(new URL("../divipol/fuentes/", import.meta.url));
const CABECERA_DANE =
  "Código Departamento,Nombre Departamento,Código Municipio,Nombre Municipio,Tipo: Municipio / Isla / Área no municipalizada,longitud,Latitud";
const ACENTO_AGUDO = String.fromCharCode(0x0301);
const TILDE_COMBINANTE = String.fromCharCode(0x0303);

/** Campo CSV: entre comillas si contiene coma o comillas, con las comillas duplicadas. */
const campoCsv = (valor) => (/[",]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor);

/** CSV con la forma del DANE a partir de filas [departamento, nombre departamento, código, municipio, tipo]. */
function csvDane(filas) {
  const lineas = filas.map(([dep, nombreDep, codigo, municipio, tipo = "Municipio"]) =>
    [dep, campoCsv(nombreDep), codigo, campoCsv(municipio), tipo, '"-75,5"', '"6,25"'].join(","),
  );
  return [CABECERA_DANE, ...lineas, ""].join("\n");
}

/** n filas sintéticas repartidas en d departamentos (10, 11, ...), con códigos únicos por construcción. */
function filasDaneSinteticas(n, d) {
  return Array.from({ length: n }, (_, i) => {
    const dep = String(10 + (i % d));
    return [dep, `DEPARTAMENTO ${dep}`, dep + String(Math.floor(i / d) + 1).padStart(3, "0"), `MUNICIPIO ${i}`];
  });
}

describe("normalizar y normalizarSinParentesis (DV-16)", () => {
  it("DV-16 normalización de nombres: MEDELLÍN, Piendamó - Tunía y BOGOTA, D.C.", () => {
    expect([..."MEDELLÍN"].map((c) => c.charCodeAt(0))).toContain(0xcd);
    expect(normalizar("MEDELLÍN")).toBe("MEDELLIN");
    expect(normalizar("Piendamó - Tunía")).toBe("PIENDAMO TUNIA");
    expect(normalizar("BOGOTA, D.C.")).toBe("BOGOTA D C");
  });

  it("DV-16 normalización sin paréntesis: ALTO BAUDO (PIE DE PATO) y EL CANTON DEL SAN PABLO (MAN.", () => {
    expect(normalizarSinParentesis("ALTO BAUDO (PIE DE PATO)")).toBe("ALTOBAUDO");
    expect(normalizarSinParentesis("EL CANTON DEL SAN PABLO (MAN.")).toBe("ELCANTONDELSANPABLO");
  });

  it("DV-16 normalizar quita marcas combinantes (Ñ, Ü, formas NFD), colapsa separadores y conserva dígitos", () => {
    expect(normalizar(`BRICE${ENE}O`)).toBe("BRICENO");
    expect(normalizar(`BRICEN${TILDE_COMBINANTE}O`)).toBe("BRICENO");
    expect(normalizar(`G${String.fromCharCode(0xdc)}ICA${ACENTO_AGUDO}N DE LA SIERRA`)).toBe("GUICAN DE LA SIERRA");
    expect(normalizar("  el\tcarmen--de   viboral 2 ")).toBe("EL CARMEN DE VIBORAL 2");
    expect(normalizar("PUERTO NARE-LA MAGDALENA")).toBe("PUERTO NARE LA MAGDALENA");
    expect(normalizar("")).toBe("");
    expect(normalizar("(.)")).toBe("");
  });

  it("DV-16 normalizarSinParentesis toma el texto anterior al primer paréntesis, sin espacios ni tildes", () => {
    expect(normalizarSinParentesis("PATIA (EL BORDO)")).toBe("PATIA");
    expect(normalizarSinParentesis("PATÍA")).toBe("PATIA");
    expect(normalizarSinParentesis("Piendamó - Tunía")).toBe("PIENDAMOTUNIA");
    expect(normalizarSinParentesis("A (B) C (D)")).toBe("A");
    expect(normalizarSinParentesis("(SOLO PARENTESIS)")).toBe("");
  });
});

describe("parsearDivipola (DV-16, integridad de la fuente DANE)", () => {
  it("DV-16 la instantánea fijada tiene 1122 filas, 33 departamentos y códigos únicos de 5 dígitos", () => {
    const filas = parsearDivipola(readFileSync(join(RAIZ_FUENTES, "divipola-dane.csv"), "utf8"));
    expect(filas).toHaveLength(1122);
    expect(new Set(filas.map((f) => f.codigoDepartamento)).size).toBe(33);
    expect(new Set(filas.map((f) => f.codigo)).size).toBe(1122);
    expect(filas[0]).toStrictEqual({ codigoDepartamento: "05", departamento: "ANTIOQUIA", codigo: "05001", municipio: "MEDELLÍN", tipo: "Municipio" });
    expect(filas.find((f) => f.codigo === "11001")).toStrictEqual({
      codigoDepartamento: "11", departamento: "BOGOTÁ, D.C.", codigo: "11001", municipio: "BOGOTÁ, D.C.", tipo: "Municipio",
    });
    expect(filas.find((f) => f.codigo === "88001")).toStrictEqual({
      codigoDepartamento: "88",
      departamento: "ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA",
      codigo: "88001",
      municipio: "SAN ANDRÉS",
      tipo: "Isla",
    });
  });

  it("DV-16 una fuente sintética de 1122 filas y 33 departamentos se acepta, con comillas escapadas y CRLF", () => {
    const filas = filasDaneSinteticas(1122, 33);
    filas[0] = ["10", 'DEP "A", B', "10001", 'MUN, "C"'];
    const resultado = parsearDivipola(csvDane(filas).replaceAll("\n", "\r\n"));
    expect(resultado).toHaveLength(1122);
    expect(resultado[0]).toStrictEqual({ codigoDepartamento: "10", departamento: 'DEP "A", B', codigo: "10001", municipio: 'MUN, "C"', tipo: "Municipio" });
    expect(resultado[1121]).toStrictEqual({
      codigoDepartamento: "42", departamento: "DEPARTAMENTO 42", codigo: "42034", municipio: "MUNICIPIO 1121", tipo: "Municipio",
    });
  });

  it("DV-16 sin salto de línea final se conserva la última fila; código de departamento de 3 dígitos se rechaza", () => {
    const texto = csvDane(filasDaneSinteticas(1122, 33));
    expect(parsearDivipola(texto.slice(0, -1))).toHaveLength(1122);
    const error = capturarError(() => parsearDivipola(csvDane([["050", "ANTIOQUIA", "05001", "MEDELLIN"]])));
    expect(error.message).toContain("línea 2");
    expect(capturarError(() => parsearDivipola("")).message).toContain("(vacía)");
  });

  it("DV-16 fuente DANE de 1121 filas: ErrorDivipol con 1121 y 1122", () => {
    const error = capturarError(() => parsearDivipola(csvDane(filasDaneSinteticas(1121, 33))));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("1121");
    expect(error.message).toContain("1122");
  });

  it("DV-16 fuente DANE de 1123 filas también aborta", () => {
    const error = capturarError(() => parsearDivipola(csvDane(filasDaneSinteticas(1123, 33))));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("1123");
  });

  it("DV-16 fuente DANE con 34 departamentos: ErrorDivipol con 34 y 33", () => {
    const error = capturarError(() => parsearDivipola(csvDane(filasDaneSinteticas(1122, 34))));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("34");
    expect(error.message).toContain("33");
  });

  it("DV-16 código de municipio repetido: ErrorDivipol con el código y la línea", () => {
    const filas = filasDaneSinteticas(1122, 33);
    // Índice 38 cae en el mismo departamento (15) que el índice 5; la línea es el índice + 2 (cabecera).
    filas[38] = [filas[38][0], filas[38][1], filas[5][2], "REPETIDO"];
    expect(filas[5][2]).toBe("15001");
    const error = capturarError(() => parsearDivipola(csvDane(filas)));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("15001");
    expect(error.message).toContain("línea 40");
  });

  it("DV-16 filas malformadas abortan con su número de línea", () => {
    const malas = [
      ["05", "ANTIOQUIA", "0500", "CORTO"],
      ["05", "ANTIOQUIA", "050011", "LARGO"],
      ["5", "ANTIOQUIA", "05001", "DEPARTAMENTO CORTO"],
      ["05", "ANTIOQUIA", "08001", "PREFIJO DISTINTO"],
      ["05", "ANTIOQUIA", "05001", ""],
      ["05", "", "05001", "SIN DEPARTAMENTO"],
      ["05", "ANTIOQUIA", "05001", "SIN TIPO", ""],
    ];
    for (const mala of malas) {
      const error = capturarError(() => parsearDivipola(csvDane([mala])));
      expect(`${mala.join("|")} -> ${error.name}: ${error.message.includes("línea 2")}`).toBe(`${mala.join("|")} -> ErrorDivipol: true`);
    }
    const otras = [
      `${CABECERA_DANE}\n05,ANTIOQUIA,05001,MEDELLIN,Municipio,"-75,5"\n`,
      `${CABECERA_DANE}\n05,ANTIOQUIA,05001,MEDELLIN,Municipio,"-75,5","6,25",X\n`,
      `${CABECERA_DANE}\n05,ANTIOQUIA,05001,"MEDELLIN,Municipio,"-75,5","6,25"\n`,
      `${CABECERA_DANE}\n05,ANTIOQUIA,05001,ME"DE,Municipio,"-75,5","6,25"\n`,
      `${CABECERA_DANE}\n\n05,ANTIOQUIA,05001,MEDELLIN,Municipio,"-75,5","6,25"\n`,
    ];
    for (const texto of otras) {
      const error = capturarError(() => parsearDivipola(texto));
      expect(`${JSON.stringify(texto)} -> ${error.name}: ${error.message.includes("línea 2")}`).toBe(`${JSON.stringify(texto)} -> ErrorDivipol: true`);
    }
  });

  it("DV-16 cabecera distinta de la del DANE: ErrorDivipol que nombra la cabecera", () => {
    const texto = csvDane([["05", "ANTIOQUIA", "05001", "MEDELLIN"]]).replace("Código Municipio", "Codigo");
    const error = capturarError(() => parsearDivipola(texto));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("cabecera");
  });

  it("DV-16 fuente vacía o solo con cabecera: ErrorDivipol", () => {
    expect(capturarError(() => parsearDivipola(""))).toBeInstanceOf(ErrorDivipol);
    expect(capturarError(() => parsearDivipola(`${CABECERA_DANE}\n`)).message).toContain("1122");
  });
});

/** Fila DIVIPOL tal como la devuelve parsearLocalities. */
const divipol = (codigo, departamento, municipio) => ({ codigo, departamento, municipio });
/** Fila DIVIPOLA tal como la devuelve parsearDivipola. */
const dane = (codigo, municipio, tipo = "Municipio") => ({
  codigoDepartamento: codigo.slice(0, 2), departamento: `DEPARTAMENTO ${codigo.slice(0, 2)}`, codigo, municipio, tipo,
});
const manual = (codigoDivipol, codigoDivipola, justificacion = "Revisada a mano en la prueba") => ({
  divipol: codigoDivipol, divipola: codigoDivipola, justificacion,
});

// Fuentes sintéticas pequeñas que ejercitan las tres etapas, un consulado y el duplicado documentado de Bogotá.
const DIVIPOL_PRUEBA = [
  divipol("88815", "CONSULADOS", "VENEZUELA"),
  divipol("01001", "ANTIOQUIA", "MEDELLIN"),
  divipol("01062", "ANTIOQUIA", `BRICE${ENE}O`),
  divipol("11058", "CAUCA", "PATIA (EL BORDO)"),
  divipol("15001", "CUNDINAMARCA", "BOGOTA, D.C."),
  divipol("16001", "BOGOTA D.C", "BOGOTA, D.C."),
  divipol("31001", "VALLE", "CALI"),
  divipol("50050", "GUAINIA", "MAPIRIPANA"),
  divipol("56001", "SAN ANDRES", "SAN ANDRES"),
];
const DANE_PRUEBA = [
  dane("05001", "MEDELLÍN"),
  dane("05107", "BRICEÑO"),
  dane("08001", "MEDELLIN"), // mismo nombre en otro departamento DANE: nunca es candidato de 01001
  dane("11001", "BOGOTÁ, D.C."),
  dane("19532", "PATÍA"),
  dane("76001", "SANTIAGO DE CALI"),
  dane("88001", "SAN ANDRÉS", "Isla"),
  dane("94001", "INÍRIDA"),
];
const MANUALES_PRUEBA = [manual("15001", "11001"), manual("31001", "76001"), manual("50050", null)];

describe("emparejar (DV-16)", () => {
  it("DV-16 tabla literal de departamentos: 33 pares y 88 sin equivalente", () => {
    expect(DEPARTAMENTOS_DANE).toStrictEqual({
      "01": "05", "03": "08", "05": "13", "07": "15", "09": "17", "11": "19", "12": "20", "13": "23", "15": "25",
      "16": "11", "17": "27", "19": "41", "21": "47", "23": "52", "24": "66", "25": "54", "26": "63", "27": "68",
      "28": "70", "29": "73", "31": "76", "40": "81", "44": "18", "46": "85", "48": "44", "50": "94", "52": "50",
      "54": "95", "56": "88", "60": "91", "64": "86", "68": "97", "72": "99", "88": null,
    });
    expect(Object.isFrozen(DEPARTAMENTOS_DANE)).toBe(true);
  });

  it("DV-16 tres etapas excluyentes sobre fuentes sintéticas: resultado exacto en orden de código DIVIPOL", () => {
    expect(emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, MANUALES_PRUEBA)).toStrictEqual([
      { divipol: "01001", divipola: "05001", metodo: "nombre-exacto" },
      { divipol: "01062", divipola: "05107", metodo: "nombre-exacto" },
      { divipol: "11058", divipola: "19532", metodo: "nombre-sin-parentesis" },
      { divipol: "15001", divipola: "11001", metodo: "manual" },
      { divipol: "16001", divipola: "11001", metodo: "nombre-exacto" },
      { divipol: "31001", divipola: "76001", metodo: "manual" },
      { divipol: "50050", divipola: null, metodo: "manual" },
      { divipol: "56001", divipola: "88001", metodo: "nombre-exacto" },
    ]);
  });

  it("DV-16 no modifica las entradas", () => {
    const copias = [structuredClone(DIVIPOL_PRUEBA), structuredClone(DANE_PRUEBA), structuredClone(MANUALES_PRUEBA)];
    emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, MANUALES_PRUEBA);
    expect([DIVIPOL_PRUEBA, DANE_PRUEBA, MANUALES_PRUEBA]).toStrictEqual(copias);
  });

  it("DV-16 la segunda etapa solo se aplica si la primera no tiene candidato y exige un único candidato", () => {
    // PATIA (EL BORDO) tiene dos candidatos sin paréntesis (PATIA y PATÍA (OTRO)): no se acepta ninguno.
    const ambigua = [divipol("11058", "CAUCA", "PATIA (EL BORDO)")];
    const error = capturarError(() => emparejar(ambigua, [dane("19532", "PATÍA"), dane("19533", "PATIA (OTRO)")], []));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("11058");
  });

  it("DV-16 la primera etapa exige un único candidato: dos nombres iguales en el departamento no se emparejan", () => {
    const error = capturarError(() => emparejar([divipol("01001", "ANTIOQUIA", "MEDELLIN")], [dane("05001", "MEDELLÍN"), dane("05002", "Medellin")], []));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("01001");
  });

  it("DV-16 fila sin resolver: ErrorDivipol con su código DIVIPOL", () => {
    const filas = [...DIVIPOL_PRUEBA, divipol("01999", "ANTIOQUIA", "INVENTADO")];
    const error = capturarError(() => emparejar(filas, DANE_PRUEBA, MANUALES_PRUEBA));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("01999");
  });

  it("DV-16 entrada manual redundante (código que ya empareja en la primera etapa): ErrorDivipol con el código", () => {
    const error = capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, [...MANUALES_PRUEBA, manual("01001", "05001")]));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("01001");
  });

  it("DV-16 entrada manual redundante en la segunda etapa, aunque contradiga el emparejamiento: ErrorDivipol", () => {
    const error = capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, [...MANUALES_PRUEBA, manual("11058", null)]));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("11058");
  });

  it("DV-16 código DANE repetido por dos códigos DIVIPOL distintos de 15001 y 16001: ErrorDivipol con el código DANE", () => {
    const filas = [...DIVIPOL_PRUEBA, divipol("01004", "ANTIOQUIA", "OTRO NOMBRE")];
    const error = capturarError(() => emparejar(filas, DANE_PRUEBA, [...MANUALES_PRUEBA, manual("01004", "05107")]));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("05107");
  });

  it("DV-16 el duplicado de Bogotá solo se admite para exactamente 15001 y 16001 en 11001", () => {
    const bogota = [divipol("15001", "CUNDINAMARCA", "BOGOTA, D.C."), divipol("16001", "BOGOTA D.C", "BOGOTA, D.C.")];
    // Un tercer código DIVIPOL hacia 11001 rompe la excepción.
    const triple = capturarError(() =>
      emparejar([...bogota, divipol("16002", "BOGOTA D.C", "OTRA")], DANE_PRUEBA, [manual("15001", "11001"), manual("16002", "11001")]),
    );
    expect(triple).toBeInstanceOf(ErrorDivipol);
    expect(triple.message).toContain("11001");
    // Solo 15001 puede apuntar fuera del prefijo DANE de su departamento (25), y solo a 11001.
    const otroCundinamarca = capturarError(() =>
      emparejar([...bogota, divipol("15004", "CUNDINAMARCA", "OTRA")], DANE_PRUEBA, [manual("15001", "11001"), manual("15004", "11001")]),
    );
    expect(otroCundinamarca).toBeInstanceOf(ErrorDivipol);
    expect(otroCundinamarca.message).toContain("15004");
    const bogotaFuera = capturarError(() => emparejar(bogota, [...DANE_PRUEBA, dane("05002", "X")], [manual("15001", "05002")]));
    expect(bogotaFuera).toBeInstanceOf(ErrorDivipol);
    expect(bogotaFuera.message).toContain("05002");
  });

  it("DV-16 entradas manuales inválidas abortan con el código DIVIPOL", () => {
    const casos = [
      [manual("01998", "05001"), "01998"], // código que no está en la tabla DIVIPOL
      [manual("88815", null), "88815"], // consulado
      [manual("01062", "05999"), "05999"], // código DANE inexistente
      [manual("01062", "08001"), "08001"], // código DANE de otro departamento
      [manual("15001", "25001"), "25001"], // inexistente en DANE_PRUEBA
      [{ divipol: "31001", divipola: "76001" }, "31001"], // sin justificación
      [manual("31001", "76001", "   "), "31001"], // justificación vacía
      [{ divipol: 31001, divipola: "76001", justificacion: "x" }, "31001"], // código no textual
      [manual("31001", "7600"), "31001"], // DANE de 4 dígitos
      [manual("31001", undefined), "31001"], // DANE ausente
    ];
    for (const [entrada, codigo] of casos) {
      const manuales = MANUALES_PRUEBA.filter((m) => m.divipol !== String(entrada.divipol));
      const error = capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, [...manuales, entrada]));
      expect(`${JSON.stringify(entrada)} -> ${error.name}: ${error.message.includes(codigo)}`).toBe(`${JSON.stringify(entrada)} -> ErrorDivipol: true`);
    }
  });

  it("DV-16 el resultado va en orden de código aunque la entrada esté desordenada", () => {
    const desordenadas = [...DIVIPOL_PRUEBA].reverse();
    expect(emparejar(desordenadas, DANE_PRUEBA, MANUALES_PRUEBA)).toStrictEqual(emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, MANUALES_PRUEBA));
    expect(emparejar(desordenadas, DANE_PRUEBA, MANUALES_PRUEBA).map((e) => e.divipol)).toStrictEqual([
      "01001", "01062", "11058", "15001", "16001", "31001", "50050", "56001",
    ]);
  });

  it("DV-16 varias entradas manuales sin equivalente no cuentan como código DANE repetido", () => {
    const filas = [...DIVIPOL_PRUEBA, divipol("01999", "ANTIOQUIA", "INVENTADO")];
    const resultado = emparejar(filas, DANE_PRUEBA, [...MANUALES_PRUEBA, manual("01999", null)]);
    expect(resultado.filter((e) => e.divipola === null).map((e) => e.divipol)).toStrictEqual(["01999", "50050"]);
  });

  it("DV-16 los mensajes de validación de la tabla manual nombran el campo inválido", () => {
    const mensaje = (entrada) => capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, [entrada])).message;
    expect(mensaje({ divipol: 31001, divipola: "76001", justificacion: "x" })).toContain("divipol debe ser un código de 5 dígitos");
    expect(mensaje(manual("3100", "76001"))).toContain("divipol debe ser un código de 5 dígitos");
    expect(mensaje(manual("31001", 76001))).toContain("divipola debe ser un código de 5 dígitos o null");
    expect(mensaje(manual("31001", "7600"))).toContain("divipola debe ser un código de 5 dígitos o null");
    expect(capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, {})).message).toContain("arreglo");
    const sinPar = capturarError(() => emparejar([divipol("99001", "INVENTADO", "MEDELLIN")], DANE_PRUEBA, [])).message;
    expect(sinPar).toContain("no está en la tabla de departamentos DANE");
  });

  it("DV-16 entrada manual repetida: ErrorDivipol con el código", () => {
    const error = capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, [...MANUALES_PRUEBA, manual("31001", "76001")]));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("31001");
  });

  it("DV-16 manuales que no son un arreglo: ErrorDivipol", () => {
    expect(capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, {}))).toBeInstanceOf(ErrorDivipol);
    expect(capturarError(() => emparejar(DIVIPOL_PRUEBA, DANE_PRUEBA, [null]))).toBeInstanceOf(ErrorDivipol);
  });

  it("DV-16 departamento DIVIPOL sin par en la tabla literal: ErrorDivipol con el código", () => {
    const error = capturarError(() => emparejar([divipol("99001", "INVENTADO", "MEDELLIN")], DANE_PRUEBA, []));
    expect(error).toBeInstanceOf(ErrorDivipol);
    expect(error.message).toContain("99001");
  });

  it("DV-16 solo acepta candidatos del departamento DANE asignado (01 -> 05, no 08)", () => {
    const resultado = emparejar([divipol("01001", "ANTIOQUIA", "MEDELLIN")], [dane("08001", "MEDELLIN"), dane("05001", "MEDELLÍN")], []);
    expect(resultado).toStrictEqual([{ divipol: "01001", divipola: "05001", metodo: "nombre-exacto" }]);
    const sinCandidato = capturarError(() => emparejar([divipol("01001", "ANTIOQUIA", "MEDELLIN")], [dane("08001", "MEDELLIN")], []));
    expect(sinCandidato.message).toContain("01001");
  });
});

describe("serializarEquivalencias (DV-16, DV-17)", () => {
  const FUENTE = {
    fuente: "DANE - DIVIPOLA Códigos municipios (datos.gov.co gdxc-w37w)",
    url: "https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD",
    licencia: "CC-BY-SA-4.0",
    sha256: SHA_DANE,
  };

  it("DV-16 DV-17 salida exacta: cabecera de atribución, metadatos y filas compactas en orden de código", () => {
    const equivalencias = [
      { divipol: "50050", divipola: null, metodo: "manual" },
      { divipol: "01001", divipola: "05001", metodo: "nombre-exacto" },
      { divipol: "11058", divipola: "19532", metodo: "nombre-sin-parentesis" },
    ];
    expect(serializarEquivalencias(equivalencias, FUENTE)).toBe(
      [
        "// Generado por tools/divipol/generar-divipol.mjs; no editar.",
        "// Equivalencia DIVIPOL (Registraduría) -> DIVIPOLA (DANE): material adaptado de DIVIPOLA, CC BY-SA 4.0.",
        "// Fuente: DANE - DIVIPOLA Códigos municipios (datos.gov.co gdxc-w37w)",
        "// URL: https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD",
        "// Licencia: CC-BY-SA-4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Avisos en packages/parsers/THIRD_PARTY_NOTICES.md.",
        `// SHA-256: ${SHA_DANE}`,
        `// Cambios: ${CAMBIOS_EQUIVALENCIAS}`,
        "",
        "export const FUENTE_EQUIVALENCIAS = {",
        '  fuente: "DANE - DIVIPOLA Códigos municipios (datos.gov.co gdxc-w37w)",',
        '  url: "https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD",',
        '  licencia: "CC-BY-SA-4.0",',
        `  sha256: "${SHA_DANE}",`,
        `  cambios: ${JSON.stringify(CAMBIOS_EQUIVALENCIAS)},`,
        "} as const;",
        "",
        "export type MetodoEquivalenciaGenerado = \"nombre-exacto\" | \"nombre-sin-parentesis\" | \"manual\";",
        "",
        "/** Filas [código DIVIPOL, código DIVIPOLA o null, método] en orden de código DIVIPOL. */",
        "export const EQUIVALENCIAS_DIVIPOLA: readonly (readonly [string, string | null, MetodoEquivalenciaGenerado])[] = [",
        '  ["01001","05001","nombre-exacto"],',
        '  ["11058","19532","nombre-sin-parentesis"],',
        '  ["50050",null,"manual"],',
        "];",
        "",
      ].join("\n"),
    );
  });

  it("DV-17 los cambios declaran que solo se conservan los códigos emparejados", () => {
    expect(CAMBIOS_EQUIVALENCIAS).toMatch(/^Solo se conservan los códigos emparejados/);
    expect(CAMBIOS_EQUIVALENCIAS).toContain("no se copian nombres");
  });

  it("DV-16 no depende del orden de entrada ni modifica el arreglo recibido", () => {
    const equivalencias = [
      { divipol: "11058", divipola: "19532", metodo: "nombre-sin-parentesis" },
      { divipol: "01001", divipola: "05001", metodo: "nombre-exacto" },
    ];
    const copia = structuredClone(equivalencias);
    expect(serializarEquivalencias(equivalencias, FUENTE)).toBe(serializarEquivalencias([...equivalencias].reverse(), FUENTE));
    expect(equivalencias).toStrictEqual(copia);
  });
});
