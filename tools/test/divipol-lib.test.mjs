// Unitarias, propiedades e integridad de tools/divipol/divipol-lib.mjs (cambio divipol-registraduria,
// design.md decisiones 7 y 8; requisitos DV-11, DV-12 y DV-14). Datos públicos o sintéticos: códigos y
// nombres de lugar, ningún dato personal.
import { createHash } from "node:crypto";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ErrorDivipol, parsearLocalities, serializarTabla, sha256, transformarNombre, verificarFuente } from "../divipol/divipol-lib.mjs";

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
