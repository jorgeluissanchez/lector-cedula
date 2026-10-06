// Búsqueda DIVIPOL (cambio divipol-registraduria, requisitos DV-01 a DV-09 y DV-11; design.md decisión 3).
// Unitarias con los literales de la spec, propiedades con fast-check y recorridos exhaustivos. Oráculos
// independientes de la implementación: objetos literales de la spec, la lista literal de departamentos de DV-10
// y una comprobación carácter a carácter del formato. Datos públicos: códigos y nombres de lugar.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DIVIPOL_METADATOS, buscarDivipol } from "../src/divipol/buscar.js";
import type { ResultadoDivipol } from "../src/divipol/buscar.js";
import { FILAS_DIVIPOL } from "../src/divipol/tabla.generated.js";
import * as principal from "../src/index.js";

const FORMATO_INVALIDO = { encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] };
const ENE = String.fromCharCode(0x00d1);

/** Dígitos de ancho completo (U+FF10 a U+FF19) y arábigo-índicos (U+0660 a U+0669) para un código ASCII. */
const conDigitos = (codigo: string, base: number): string =>
  [...codigo].map((c) => String.fromCharCode(base + c.charCodeAt(0) - 0x30)).join("");

/** Oráculo del formato válido de DV-01, escrito carácter a carácter (sin la expresión regular del código). */
function esCodigoAscii(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.length !== 5) return false;
  for (let i = 0; i < 5; i++) {
    const c = valor.charCodeAt(i);
    if (c < 0x30 || c > 0x39) return false;
  }
  return true;
}

// DV-10, escenario "Nombres de departamento": los 34 códigos de departamento de la tabla.
const DEPARTAMENTOS = new Set([
  "01", "03", "05", "07", "09", "11", "12", "13", "15", "16", "17", "19", "21", "23", "24", "25", "26", "27",
  "28", "29", "31", "40", "44", "46", "48", "50", "52", "54", "56", "60", "64", "68", "72", "88",
]);

describe("DV-01 entrada estricta de cinco dígitos", { timeout: 60_000 }, () => {
  it("DV-01 cadena con espacios", () => {
    expect(buscarDivipol(" 01001")).toStrictEqual(FORMATO_INVALIDO);
  });

  it("DV-01 longitudes distintas de cinco", () => {
    for (const entrada of ["", "0100", "010010", "1001"]) expect(buscarDivipol(entrada)).toStrictEqual(FORMATO_INVALIDO);
  });

  it("DV-01 número en lugar de texto", () => {
    expect(buscarDivipol(1001)).toStrictEqual(FORMATO_INVALIDO);
    expect(buscarDivipol(31019)).toStrictEqual(FORMATO_INVALIDO);
  });

  it("DV-01 dígitos no ASCII", () => {
    const anchoCompleto = conDigitos("01001", 0xff10);
    const arabigoIndico = conDigitos("01001", 0x0660);
    expect([...anchoCompleto].map((c) => c.charCodeAt(0))).toStrictEqual([0xff10, 0xff11, 0xff10, 0xff10, 0xff11]);
    expect([...arabigoIndico].map((c) => c.charCodeAt(0))).toStrictEqual([0x0660, 0x0661, 0x0660, 0x0660, 0x0661]);
    expect(buscarDivipol(anchoCompleto)).toStrictEqual(FORMATO_INVALIDO);
    expect(buscarDivipol(arabigoIndico)).toStrictEqual(FORMATO_INVALIDO);
  });

  it("DV-01 separador entre departamento y municipio", () => {
    expect(buscarDivipol("01-001")).toStrictEqual(FORMATO_INVALIDO);
    expect(buscarDivipol("01 001")).toStrictEqual(FORMATO_INVALIDO);
  });

  it("DV-01 sin recortar: salto de línea o espacio final y caracteres alrededor de un código válido", () => {
    for (const entrada of ["01001\n", "01001 ", "\n01001", "x01001", "01001x", "0100a", "a1001"]) {
      expect(buscarDivipol(entrada)).toStrictEqual(FORMATO_INVALIDO);
    }
  });

  it("DV-01 propiedad: cadenas de 5 caracteres con al menos uno fuera de 0-9 dan formato-invalido", () => {
    // Válido por construcción: un carácter UTF-16 cualquiera y otro que nunca es dígito ASCII.
    const cualquiera = fc.integer({ min: 0, max: 0xffff }).map((n) => String.fromCharCode(n));
    const noDigito = fc.integer({ min: 0, max: 0xffff - 10 }).map((n) => String.fromCharCode(n >= 0x30 ? n + 10 : n));
    const entrada = fc
      .tuple(fc.array(cualquiera, { minLength: 4, maxLength: 4 }), noDigito, fc.integer({ min: 0, max: 4 }))
      .map(([resto, malo, posicion]) => [...resto.slice(0, posicion), malo, ...resto.slice(posicion)].join(""));
    fc.assert(
      fc.property(entrada, (codigo) => {
        expect(codigo.length).toBe(5);
        expect(buscarDivipol(codigo)).toStrictEqual(FORMATO_INVALIDO);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("DV-02 búsqueda de un código existente", () => {
  it("DV-02 Antioquia es 01", () => {
    expect(buscarDivipol("01001")).toStrictEqual({
      encontrado: true, codigo: "01001", codigoDepartamento: "01", codigoMunicipio: "001",
      departamento: "ANTIOQUIA", municipio: "MEDELLIN", tipo: "municipio", warnings: [],
    });
  });

  it("DV-02 Valle es 31", () => {
    expect(buscarDivipol("31001")).toStrictEqual({
      encontrado: true, codigo: "31001", codigoDepartamento: "31", codigoMunicipio: "001",
      departamento: "VALLE", municipio: "CALI", tipo: "municipio", warnings: [],
    });
    expect(buscarDivipol("31019")).toStrictEqual({
      encontrado: true, codigo: "31019", codigoDepartamento: "31", codigoMunicipio: "019",
      departamento: "VALLE", municipio: "BUENAVENTURA", tipo: "municipio", warnings: [],
    });
  });

  it("DV-02 Bogotá es 16", () => {
    expect(buscarDivipol("16001")).toStrictEqual({
      encontrado: true, codigo: "16001", codigoDepartamento: "16", codigoMunicipio: "001",
      departamento: "BOGOTA D.C", municipio: "BOGOTA, D.C.", tipo: "municipio", warnings: [],
    });
  });

  it("DV-02 departamento con Ñ en la fuente, codificado como U+00D1", () => {
    const resultado = buscarDivipol("23001");
    expect(resultado).toStrictEqual({
      encontrado: true, codigo: "23001", codigoDepartamento: "23", codigoMunicipio: "001",
      departamento: `NARI${ENE}O`, municipio: "PASTO", tipo: "municipio", warnings: [],
    });
    const departamento = resultado.encontrado ? resultado.departamento : "";
    expect([...departamento].map((c) => c.codePointAt(0))).toStrictEqual([0x4e, 0x41, 0x52, 0x49, 0xd1, 0x4f]);
    expect(departamento).toBe("NARIÑO");
  });
});

describe("DV-03 DIVIPOL no es DIVIPOLA", () => {
  it("DV-03 05001 es Cartagena, no Medellín", () => {
    expect(buscarDivipol("05001")).toStrictEqual({
      encontrado: true, codigo: "05001", codigoDepartamento: "05", codigoMunicipio: "001",
      departamento: "BOLIVAR", municipio: "CARTAGENA", tipo: "municipio", warnings: [],
    });
  });

  it("DV-03 11001 es Popayán, no Bogotá", () => {
    expect(buscarDivipol("11001")).toStrictEqual({
      encontrado: true, codigo: "11001", codigoDepartamento: "11", codigoMunicipio: "001",
      departamento: "CAUCA", municipio: "POPAYAN", tipo: "municipio", warnings: [],
    });
  });

  it("DV-03 76001 no existe en DIVIPOL", () => {
    expect(buscarDivipol("76001")).toStrictEqual({ encontrado: false, codigo: "76001", motivo: "desconocido", warnings: [] });
  });
});

describe("DV-04 Bogotá duplicada como 15/001", () => {
  it("DV-04 código histórico de Bogotá", () => {
    expect(buscarDivipol("15001")).toStrictEqual({
      encontrado: true, codigo: "15001", codigoDepartamento: "15", codigoMunicipio: "001",
      departamento: "CUNDINAMARCA", municipio: "BOGOTA, D.C.", tipo: "municipio", warnings: ["D02"],
    });
  });

  it("DV-04 código vigente de Bogotá sin advertencia", () => {
    const resultado = buscarDivipol("16001");
    expect(resultado.warnings).toStrictEqual([]);
  });
});

describe("DV-05 consulados con código 88", { timeout: 60_000 }, () => {
  it("DV-05 consulado existente", () => {
    expect(buscarDivipol("88815")).toStrictEqual({
      encontrado: true, codigo: "88815", codigoDepartamento: "88", codigoMunicipio: "815",
      departamento: "CONSULADOS", municipio: "VENEZUELA", tipo: "consulado", warnings: ["D03"],
    });
  });

  it("DV-05 consulado con Ñ restaurada", () => {
    const resultado = buscarDivipol("88355");
    expect(resultado).toMatchObject({ encontrado: true, municipio: `ESPA${ENE}A`, tipo: "consulado", warnings: ["D03"] });
    expect(resultado.warnings).toStrictEqual(["D03"]);
  });

  it("DV-05 consulado ausente de la tabla", () => {
    expect(buscarDivipol("88470")).toStrictEqual({ encontrado: false, codigo: "88470", motivo: "desconocido", warnings: ["D01"] });
  });

  it("DV-05 propiedad exhaustiva: las 67 filas con departamento 88 son consulados con D03", () => {
    const consulados = FILAS_DIVIPOL.filter(([codigo]) => codigo.startsWith("88"));
    expect(consulados).toHaveLength(67);
    for (const [codigo, municipio] of consulados) {
      expect(buscarDivipol(codigo)).toStrictEqual({
        encontrado: true, codigo, codigoDepartamento: "88", codigoMunicipio: codigo.slice(2),
        departamento: "CONSULADOS", municipio, tipo: "consulado", warnings: ["D03"],
      });
    }
  });

  it("DV-02 DV-04 propiedad exhaustiva: las 1123 filas municipales tienen tipo municipio y solo 15001 lleva D02", () => {
    const municipales = FILAS_DIVIPOL.filter(([codigo]) => !codigo.startsWith("88"));
    expect(municipales).toHaveLength(1123);
    const conAdvertencias: [string, string[]][] = [];
    for (const [codigo, municipio] of municipales) {
      const resultado = buscarDivipol(codigo);
      expect(resultado).toMatchObject({ encontrado: true, codigo, municipio, tipo: "municipio" });
      if (resultado.warnings.length > 0) conAdvertencias.push([codigo, resultado.warnings]);
    }
    expect(conAdvertencias).toStrictEqual([["15001", ["D02"]]]);
  });
});

describe("DV-06 código desconocido", () => {
  it("DV-06 municipio creado después de la fuente", () => {
    expect(buscarDivipol("17082")).toStrictEqual({ encontrado: false, codigo: "17082", motivo: "desconocido", warnings: ["D01"] });
  });

  it("DV-06 departamento inexistente", () => {
    expect(buscarDivipol("99001")).toStrictEqual({ encontrado: false, codigo: "99001", motivo: "desconocido", warnings: [] });
    expect(buscarDivipol("02001")).toStrictEqual({ encontrado: false, codigo: "02001", motivo: "desconocido", warnings: [] });
  });

  it("DV-06 municipio 000 de un departamento existente", () => {
    expect(buscarDivipol("01000")).toStrictEqual({ encontrado: false, codigo: "01000", motivo: "desconocido", warnings: ["D01"] });
  });
});

describe("DV-07 código sin dato", () => {
  it("DV-07 ceros", () => {
    expect(buscarDivipol("00000")).toStrictEqual({ encontrado: false, codigo: "00000", motivo: "sin-dato", warnings: ["D04"] });
  });

  it("DV-07 departamento 00 con municipio distinto de 000", () => {
    expect(buscarDivipol("00001")).toStrictEqual({ encontrado: false, codigo: "00001", motivo: "desconocido", warnings: [] });
  });
});

describe("DV-08 función pura y total", { timeout: 60_000 }, () => {
  const fuzz = (valor: unknown): void => {
    const resultado = buscarDivipol(valor);
    if (!esCodigoAscii(valor)) expect(resultado).toStrictEqual(FORMATO_INVALIDO);
    else expect(resultado.codigo).toBe(valor);
  };

  it("DV-08 nunca lanza con fc.anything()", () => {
    fc.assert(fc.property(fc.anything(), fuzz), { numRuns: 1000 });
  });

  it("DV-08 nunca lanza con fc.string()", () => {
    fc.assert(fc.property(fc.string(), fuzz), { numRuns: 1000 });
  });

  it("DV-08 nunca lanza con fc.string({ unit: \"binary\" })", () => {
    fc.assert(fc.property(fc.string({ unit: "binary" }), fuzz), { numRuns: 1000 });
  });

  it("DV-08 determinismo: dos llamadas con la misma entrada dan resultados iguales y arreglos distintos", () => {
    const entrada = fc.oneof(
      fc.constantFrom(...FILAS_DIVIPOL.map(([codigo]) => codigo)),
      fc.stringMatching(/^[0-9]{5}$/),
      fc.anything(),
    );
    let deTabla = 0;
    let total = 0;
    fc.assert(
      fc.property(entrada, (valor) => {
        const a = buscarDivipol(valor);
        const b = buscarDivipol(valor);
        expect(b).toStrictEqual(a);
        expect(b).not.toBe(a);
        expect(b.warnings).not.toBe(a.warnings);
        total++;
        if (a.encontrado) deTabla++;
      }),
      { numRuns: 1000 },
    );
    // La propiedad no es vacía: una parte sustancial de las entradas son códigos de la tabla.
    expect(deTabla / total).toBeGreaterThan(0.2);
  });

  it("DV-08 resultado mutado no contamina la tabla", () => {
    const primero = buscarDivipol("15001");
    if (!primero.encontrado) throw new Error("15001 debe estar en la tabla");
    primero.municipio = "X";
    primero.warnings.length = 0;
    const segundo = buscarDivipol("15001");
    expect(segundo).toMatchObject({ municipio: "BOGOTA, D.C.", warnings: ["D02"] });
    expect(segundo.warnings).toStrictEqual(["D02"]);
  });

  it("DV-08 los arreglos warnings de los resultados no encontrados también son nuevos en cada llamada", () => {
    for (const codigo of ["00000", "17082", "99001", "1001", "88815", "01001"]) {
      buscarDivipol(codigo).warnings.push("X");
    }
    expect(buscarDivipol("00000").warnings).toStrictEqual(["D04"]);
    expect(buscarDivipol("17082").warnings).toStrictEqual(["D01"]);
    expect(buscarDivipol("99001").warnings).toStrictEqual([]);
    expect(buscarDivipol("1001").warnings).toStrictEqual([]);
    expect(buscarDivipol("88815").warnings).toStrictEqual(["D03"]);
    expect(buscarDivipol("01001").warnings).toStrictEqual([]);
  });

  it("DV-08 objetos con toString o valueOf", () => {
    expect(buscarDivipol({ toString: () => "01001" })).toStrictEqual(FORMATO_INVALIDO);
    expect(buscarDivipol(new String("01001"))).toStrictEqual(FORMATO_INVALIDO);
    expect(buscarDivipol({ valueOf: () => "01001" })).toStrictEqual(FORMATO_INVALIDO);
    expect(buscarDivipol(["01001"])).toStrictEqual(FORMATO_INVALIDO);
  });
});

describe("DV-09 cobertura exacta y ida y vuelta", { timeout: 60_000 }, () => {
  // Sin expect dentro del bucle (100000 iteraciones): se acumulan las discrepancias y se comprueban al final.
  it("DV-09 recorrido exhaustivo de los 100000 códigos", { timeout: 60_000 }, async () => {
    const tabla = new Set(FILAS_DIVIPOL.map(([codigo]) => codigo));
    const encontrados: string[] = [];
    const sinDato: string[] = [];
    let desconocidos = 0;
    const discrepancias: string[] = [];
    for (let n = 0; n < 100_000; n++) {
      // Cede el bucle de eventos para no bloquear la RPC del worker de Vitest en máquinas cargadas.
      if (n % 10_000 === 0) await new Promise((listo) => setTimeout(listo, 0));
      const codigo = String(n).padStart(5, "0");
      const resultado: ResultadoDivipol = buscarDivipol(codigo);
      if (resultado.encontrado) {
        encontrados.push(codigo);
      } else if (resultado.motivo === "sin-dato") {
        sinDato.push(codigo);
      } else {
        desconocidos++;
        const esperado = DEPARTAMENTOS.has(codigo.slice(0, 2)) ? "D01" : "";
        if (resultado.motivo !== "desconocido" || resultado.codigo !== codigo || resultado.warnings.join() !== esperado) {
          discrepancias.push(codigo);
        }
      }
    }
    expect(encontrados).toHaveLength(1190);
    expect(encontrados.every((codigo) => tabla.has(codigo))).toBe(true);
    expect(sinDato).toStrictEqual(["00000"]);
    expect(desconocidos).toBe(98_809);
    expect(discrepancias).toStrictEqual([]);
  });

  it("DV-09 ida y vuelta de cada fila", () => {
    let filas = 0;
    for (const [codigo] of FILAS_DIVIPOL) {
      const resultado = buscarDivipol(codigo);
      if (!resultado.encontrado) throw new Error(`${codigo} debe estar en la tabla`);
      expect(resultado.codigo).toBe(codigo);
      expect(resultado.codigoDepartamento + resultado.codigoMunicipio).toBe(codigo);
      expect(resultado.codigoDepartamento).toHaveLength(2);
      expect(buscarDivipol(resultado.codigo)).toStrictEqual(resultado);
      filas++;
    }
    expect(filas).toBe(1190);
  });
});

describe("DV-11 metadatos de la fuente y exportaciones del principal", () => {
  it("DV-11 metadatos exportados", () => {
    expect(DIVIPOL_METADATOS).toStrictEqual({
      fuente: "Eitol/colombian-cedula-reader",
      commit: "d72a342deb7255ca49cafe16bb3f8c0b6e54869a",
      ruta: "src/barcode/localities.py",
      licencia: "MIT",
      sha256: "56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1",
      filas: 1190,
    });
    expect(Object.isFrozen(DIVIPOL_METADATOS)).toBe(true);
  });

  it("DV-11 el punto de entrada principal exporta buscarDivipol y DIVIPOL_METADATOS", () => {
    expect(principal.buscarDivipol).toBe(buscarDivipol);
    expect(principal.DIVIPOL_METADATOS).toBe(DIVIPOL_METADATOS);
  });
});
