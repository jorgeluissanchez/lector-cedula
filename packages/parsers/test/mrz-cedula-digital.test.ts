// fixture-sintetico: todas las MRZ son sintéticas (NUIP y serial que empiezan por 9999, nombres inventados),
// salvo el espécimen TD1 de ICAO Doc 9303 y el ejemplo sintético público de Eitol (MZ-20, caso negativo).
// Contrato: openspec/changes/parser-mrz-cedula-digital/specs/mrz-cedula-digital/spec.md (MZ-01 a MZ-20).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsearMrzCedulaDigital } from "../src/index.js";
import type { ResultadoMrzCedulaDigital } from "../src/index.js";
import { cumpleFormaMz01 } from "./ayudas/forma-mrz.js";

/* Base sintética B de la spec. */
const B1 = "ICCOL999900123816001<<<<<<<<<<";
const B2 = "9007150F3407150COL9999123456<5";
const B3 = "FICTICIO<EJEMPLO<<ANA<MARIA<<<";
const REF = { fechaReferencia: "2026-10-06" };

/** "Se parsea B" con las líneas sustituidas que se indiquen. */
function parsearB(cambios: { l1?: string; l2?: string; l3?: string } = {}, opciones: unknown = REF) {
  return parsearMrzCedulaDigital([cambios.l1 ?? B1, cambios.l2 ?? B2, cambios.l3 ?? B3], opciones);
}

/** Abreviatura de la spec: `[estado, leido, calculado]`. */
function dc(estado: string, leido: string, calculado: number) {
  return { estado, leido, calculado };
}


const rechazo = (motivo: string) => ({ ok: false, motivo });
const rechazoLinea = (motivo: string, linea: number) => ({ ok: false, motivo, linea });

describe("MZ-01 forma del resultado (rechazos)", () => {
  it("MZ-01 Rechazo de una línea concreta", () => {
    expect(parsearB({ l3: "FICTICIO<EJEMPLO<<ANA<MARIA<<" })).toStrictEqual(rechazoLinea("longitud-linea-invalida", 3));
  });

  it("MZ-01 Rechazo sin línea", () => {
    expect(parsearMrzCedulaDigital([B1, B2], REF)).toStrictEqual(rechazo("numero-lineas-invalido"));
  });
});

// Propiedades con numRuns >= 1000: margen para la instrumentación de cobertura y Stryker con agentes en paralelo.
describe("MZ-02 función pura y total", { timeout: 60_000 }, () => {
  it("MZ-02 Nunca lanza con valores arbitrarios", () => {
    fc.assert(
      fc.property(fc.anything(), (lineas) => {
        expect(cumpleFormaMz01(parsearMrzCedulaDigital(lineas, REF))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("MZ-02 Nunca lanza con tres cadenas arbitrarias (fc.string)", () => {
    fc.assert(
      fc.property(fc.tuple(fc.string(), fc.string(), fc.string()), (lineas) => {
        expect(cumpleFormaMz01(parsearMrzCedulaDigital(lineas, REF))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("MZ-02 Nunca lanza con tres cadenas arbitrarias (fc.string binario)", () => {
    const binaria = fc.string({ unit: "binary" });
    fc.assert(
      fc.property(fc.tuple(binaria, binaria, binaria), (lineas) => {
        expect(cumpleFormaMz01(parsearMrzCedulaDigital(lineas, REF))).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("MZ-02 Nunca lanza con tres cadenas de 30 caracteres del alfabeto MRZ (llega a los campos)", () => {
    const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<".split("");
    const linea = fc.array(fc.constantFrom(...alfabeto), { minLength: 30, maxLength: 30 }).map((p) => p.join(""));
    // Prefijo ICCOL en la línea 1 para que el resultado sea ok: true y se ejerciten todos los campos.
    const l1 = linea.map((l) => "ICCOL" + l.slice(5));
    let aceptadas = 0;
    fc.assert(
      fc.property(fc.tuple(l1, linea, linea), (lineas) => {
        const r = parsearMrzCedulaDigital(lineas, REF);
        if (r.ok) aceptadas++;
        expect(cumpleFormaMz01(r)).toBe(true);
      }),
      { numRuns: 1000 },
    );
    expect(aceptadas).toBe(1000);
  });

  it("MZ-02 Nunca lanza con opciones arbitrarias", () => {
    fc.assert(
      fc.property(fc.anything(), (opciones) => {
        const r = parsearMrzCedulaDigital([B1, B2, B3], opciones);
        expect(cumpleFormaMz01(r)).toBe(true);
        if (!r.ok) expect(r).toStrictEqual(rechazo("fecha-referencia-invalida"));
        else expect(r.valido).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("MZ-03 rechazo estructural y prioridad de motivos", () => {
  it("MZ-03 No es un array", () => {
    expect(parsearMrzCedulaDigital(B1, REF)).toStrictEqual(rechazo("entrada-no-valida"));
    expect(parsearMrzCedulaDigital(null, REF)).toStrictEqual(rechazo("entrada-no-valida"));
  });

  it("MZ-03 Elemento que no es cadena", () => {
    expect(parsearMrzCedulaDigital([B1, B2, 3], REF)).toStrictEqual(rechazo("entrada-no-valida"));
  });

  it("MZ-03 elemento no cadena en la primera posición, hueco y objeto String", () => {
    expect(parsearMrzCedulaDigital([3, B2, B3], REF)).toStrictEqual(rechazo("entrada-no-valida"));
    // eslint-disable-next-line no-sparse-arrays
    expect(parsearMrzCedulaDigital([B1, , B3], REF)).toStrictEqual(rechazo("entrada-no-valida"));
    expect(parsearMrzCedulaDigital([B1, B2, new String(B3)], REF)).toStrictEqual(rechazo("entrada-no-valida"));
    expect(parsearMrzCedulaDigital({ 0: B1, 1: B2, 2: B3, length: 3 }, REF)).toStrictEqual(
      rechazo("entrada-no-valida"),
    );
  });

  it("MZ-03 el tipo de los elementos se revisa antes que el número de líneas", () => {
    expect(parsearMrzCedulaDigital([B1, 2], REF)).toStrictEqual(rechazo("entrada-no-valida"));
    expect(parsearMrzCedulaDigital([B1, B2, B3, 4], REF)).toStrictEqual(rechazo("entrada-no-valida"));
  });

  it("MZ-03 Dos o cuatro líneas", () => {
    expect(parsearMrzCedulaDigital([B1, B2], REF)).toStrictEqual(rechazo("numero-lineas-invalido"));
    expect(parsearMrzCedulaDigital([B1, B2, B3, ""], REF)).toStrictEqual(rechazo("numero-lineas-invalido"));
    expect(parsearMrzCedulaDigital([], REF)).toStrictEqual(rechazo("numero-lineas-invalido"));
  });

  it("MZ-03 Línea demasiado larga", () => {
    expect(parsearB({ l2: "<".repeat(65) })).toStrictEqual(rechazoLinea("entrada-demasiado-larga", 2));
  });

  it("MZ-03 límite de 64 unidades UTF-16 en cada línea", () => {
    // 64 unidades se admiten (aquí con espacios que la normalización quita); 65 no.
    const l1Con34Espacios = " ".repeat(34) + B1;
    expect(l1Con34Espacios.length).toBe(64);
    expect(parsearB({ l1: l1Con34Espacios }).ok).toBe(true);
    expect(parsearB({ l1: " " + l1Con34Espacios })).toStrictEqual(rechazoLinea("entrada-demasiado-larga", 1));
    expect(parsearB({ l3: "<".repeat(65) })).toStrictEqual(rechazoLinea("entrada-demasiado-larga", 3));
    // Un carácter astral cuenta como 2 unidades.
    expect(parsearB({ l3: "\u{1F600}".repeat(33) })).toStrictEqual(rechazoLinea("entrada-demasiado-larga", 3));
    expect(parsearB({ l3: "\u{1F600}".repeat(32) })).toStrictEqual(rechazoLinea("caracteres-invalidos", 3));
  });

  it("MZ-03 La longitud máxima se revisa en todas las líneas antes que los caracteres", () => {
    expect(parsearMrzCedulaDigital(["Ñ", "<".repeat(65), B3], REF)).toStrictEqual(
      rechazoLinea("entrada-demasiado-larga", 2),
    );
  });

  it("MZ-03 La fecha de referencia se revisa antes que las líneas", () => {
    expect(parsearMrzCedulaDigital([B1, "<".repeat(65), B3])).toStrictEqual(rechazo("fecha-referencia-invalida"));
  });

  it("MZ-03 el número de líneas se revisa antes que la fecha de referencia", () => {
    expect(parsearMrzCedulaDigital([B1, B2])).toStrictEqual(rechazo("numero-lineas-invalido"));
    expect(parsearMrzCedulaDigital(null)).toStrictEqual(rechazo("entrada-no-valida"));
  });

  it("MZ-03 Longitud antes que tipo de documento", () => {
    expect(
      parsearMrzCedulaDigital(["IDCOL999900123816001<<<<<<<<<<", B2, "FICTICIO<EJEMPLO<<ANA<MARIA<<"], REF),
    ).toStrictEqual(rechazoLinea("longitud-linea-invalida", 3));
  });

  it("MZ-03 caracteres inválidos en todas las líneas antes que la longitud", () => {
    expect(parsearMrzCedulaDigital(["ICCOL", B2, "PEÑA<FICTICIO<<ANA<<<<<<<<<<<<"], REF)).toStrictEqual(
      rechazoLinea("caracteres-invalidos", 3),
    );
    expect(parsearMrzCedulaDigital(["ICCOL", "9007150F3407150COL9999123456<", B3], REF)).toStrictEqual(
      rechazoLinea("longitud-linea-invalida", 1),
    );
    expect(parsearB({ l2: "9007150F3407150COL9999123456<" })).toStrictEqual(rechazoLinea("longitud-linea-invalida", 2));
    expect(parsearB({ l2: "9007150F3407150COL9999123456<5-" })).toStrictEqual(rechazoLinea("caracteres-invalidos", 2));
  });
});

describe("MZ-04 fecha de referencia explícita", () => {
  it("MZ-04 Opciones ausentes", () => {
    expect(parsearMrzCedulaDigital([B1, B2, B3])).toStrictEqual(rechazo("fecha-referencia-invalida"));
    expect(parsearMrzCedulaDigital([B1, B2, B3], {})).toStrictEqual(rechazo("fecha-referencia-invalida"));
  });

  it("MZ-04 Fechas de referencia inválidas", () => {
    for (const fechaReferencia of ["2026-02-30", "2026-10-6", "06/10/2026", "1999-12-31", "2100-01-01", " 2026-10-06", 20261006]) {
      expect(parsearB({}, { fechaReferencia })).toStrictEqual(rechazo("fecha-referencia-invalida"));
    }
  });

  it("MZ-04 más fechas inválidas: mes y día fuera de rango, 29 de febrero no bisiesto, separadores", () => {
    for (const fechaReferencia of [
      "2026-00-10",
      "2026-13-01",
      "2026-01-00",
      "2026-01-32",
      "2026-04-31",
      "2026-06-31",
      "2026-09-31",
      "2026-11-31",
      "2025-02-29",
      "2026-10-06 ",
      "2026/10/06",
      "2026-10-0a",
      "2O26-10-06",
      "20261-0-06",
      "",
      null,
      undefined,
    ]) {
      expect(parsearB({}, { fechaReferencia })).toStrictEqual(rechazo("fecha-referencia-invalida"));
    }
  });

  it("MZ-04 opciones que no son objeto", () => {
    for (const opciones of [null, "2026-10-06", 20261006, true]) {
      expect(parsearB({}, opciones)).toStrictEqual(rechazo("fecha-referencia-invalida"));
    }
  });

  it("MZ-04 Propiedad heredada", () => {
    expect(parsearB({}, Object.create({ fechaReferencia: "2026-10-06" }))).toStrictEqual(
      rechazo("fecha-referencia-invalida"),
    );
  });

  it("MZ-04 Límites admitidos", () => {
    for (const fechaReferencia of ["2000-02-29", "2099-12-31"]) {
      const r = parsearB({}, { fechaReferencia });
      expect(r.ok).toBe(true);
    }
  });

  it("MZ-04 fechas válidas de fin de mes y bisiesto", () => {
    for (const fechaReferencia of ["2024-02-29", "2026-01-31", "2026-02-28", "2026-04-30", "2026-12-31", "2000-01-01"]) {
      expect(parsearB({}, { fechaReferencia }).ok).toBe(true);
    }
  });
});

describe("MZ-05 normalización y alfabeto MRZ (rechazos)", () => {
  it("MZ-05 Ñ en el nombre", () => {
    expect(parsearB({ l3: "PEÑA<FICTICIO<<ANA<<<<<<<<<<<<" })).toStrictEqual(rechazoLinea("caracteres-invalidos", 3));
  });

  it("MZ-05 Relleno leído como comillas angulares o espacio duro", () => {
    expect(parsearB({ l1: "ICCOL999900123816001<<<<<<<<<\u00AB" })).toStrictEqual(
      rechazoLinea("caracteres-invalidos", 1),
    );
    expect(parsearB({ l1: "ICCOL999900123816001<<<<<<<<<\u00A0" })).toStrictEqual(
      rechazoLinea("caracteres-invalidos", 1),
    );
  });

  it("MZ-05 Línea de 31 caracteres", () => {
    expect(parsearB({ l1: "ICCOL999900123816001<<<<<<<<<<<" })).toStrictEqual(
      rechazoLinea("longitud-linea-invalida", 1),
    );
  });

  it("MZ-05 solo se pasan a mayúsculas las letras ASCII: \u00DF, \u0131 y letras acentuadas se rechazan", () => {
    for (const c of ["\u00DF", "\u0131", "á", "Á", "\u017F"]) {
      expect(parsearB({ l3: "FICTICIO<EJEMPLO<<ANA<MARI" + c + "<<<" })).toStrictEqual(
        rechazoLinea("caracteres-invalidos", 3),
      );
    }
  });

  it("MZ-05 otros espacios en blanco no se eliminan", () => {
    for (const c of ["\u000B", "\u000C", "\u2028", "\u3000", "\uFEFF"]) {
      expect(parsearB({ l2: B2.slice(0, 10) + c + B2.slice(10) })).toStrictEqual(
        rechazoLinea("caracteres-invalidos", 2),
      );
    }
  });
});

describe("MZ-06 identificación de la cédula digital (rechazos)", () => {
  it("MZ-06 Otro tipo de documento u otro país", () => {
    for (const l1 of [
      "IDCOL999900123816001<<<<<<<<<<",
      "ICVEN999900123816001<<<<<<<<<<",
      "I<COL999900123816001<<<<<<<<<<",
    ]) {
      expect(parsearB({ l1 })).toStrictEqual(rechazo("no-es-cedula-digital"));
    }
  });

  it("MZ-06 cada posición del prefijo ICCOL se comprueba", () => {
    for (const l1 of [
      "ACCOL999900123816001<<<<<<<<<<",
      "IICOL999900123816001<<<<<<<<<<",
      "ICOOL999900123816001<<<<<<<<<<",
      "ICCQL999900123816001<<<<<<<<<<",
      "ICCO1999900123816001<<<<<<<<<<",
      "ICC0O999900123816001<<<<<<<<<<",
      "IC0OL999900123816001<<<<<<<<<<",
    ]) {
      expect(parsearB({ l1 })).toStrictEqual(rechazo("no-es-cedula-digital"));
    }
  });

  it("MZ-06 Espécimen TD1 de ICAO", () => {
    expect(
      parsearMrzCedulaDigital(
        ["I<UTOD231458907<<<<<<<<<<<<<<<", "7408122F1204159UTO<<<<<<<<<<<6", "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"],
        REF,
      ),
    ).toStrictEqual(rechazo("no-es-cedula-digital"));
  });
});

/** Resultado con `ok: true` o falla la prueba. */
function aceptado(r: ResultadoMrzCedulaDigital) {
  if (!r.ok) throw new Error(`se esperaba ok: true y llegó ${JSON.stringify(r)}`);
  return r;
}

describe("MZ-09 los cuatro dígitos de control", () => {
  it("MZ-09 Dígito del serial alterado", () => {
    const r = aceptado(parsearB({ l1: "ICCOL999900123716001<<<<<<<<<<" }));
    expect(r.digitosControl).toStrictEqual({
      serial: dc("invalido", "7", 8),
      nacimiento: dc("valido", "0", 0),
      vencimiento: dc("valido", "0", 0),
      compuesto: dc("invalido", "5", 8),
    });
    expect(r.valido).toBe(false);
  });

  it("MZ-09 Dígito de nacimiento alterado", () => {
    const r = aceptado(parsearB({ l2: "9007151F3407150COL9999123456<5" }));
    expect(r.digitosControl).toStrictEqual({
      serial: dc("valido", "8", 8),
      nacimiento: dc("invalido", "1", 0),
      vencimiento: dc("valido", "0", 0),
      compuesto: dc("invalido", "5", 8),
    });
    expect(r.valido).toBe(false);
  });

  it("MZ-09 Dígito de vencimiento alterado", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407151COL9999123456<5" }));
    expect(r.digitosControl).toStrictEqual({
      serial: dc("valido", "8", 8),
      nacimiento: dc("valido", "0", 0),
      vencimiento: dc("invalido", "1", 0),
      compuesto: dc("invalido", "5", 6),
    });
    expect(r.valido).toBe(false);
  });

  it("MZ-09 Dígito compuesto alterado", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407150COL9999123456<6" }));
    expect(r.digitosControl).toStrictEqual({
      serial: dc("valido", "8", 8),
      nacimiento: dc("valido", "0", 0),
      vencimiento: dc("valido", "0", 0),
      compuesto: dc("invalido", "6", 5),
    });
    expect(r.valido).toBe(false);
    expect(r.campos).toStrictEqual(aceptado(parsearB()).campos);
  });

  it("MZ-09 Dígito ilegible", () => {
    const r = aceptado(parsearB({ l1: "ICCOL999900123X16001<<<<<<<<<<" }));
    expect(r.digitosControl.serial).toStrictEqual(dc("ilegible", "X", 8));
    expect(r.digitosControl.compuesto).toStrictEqual(dc("invalido", "5", 0));
    expect(r.valido).toBe(false);
  });

  it("MZ-09 relleno en los dígitos de nacimiento, vencimiento y compuesto es ilegible (ausente solo en el serial)", () => {
    const r = aceptado(parsearB({ l2: "9007150F340715<COL9999123456<<" }));
    expect(r.digitosControl.vencimiento).toStrictEqual(dc("ilegible", "<", 0));
    expect(r.digitosControl.compuesto.estado).toBe("ilegible");
    expect(r.digitosControl.compuesto.leido).toBe("<");
    expect(r.valido).toBe(false);
    const n = aceptado(parsearB({ l2: "900715<F3407150COL9999123456<5" }));
    expect(n.digitosControl.nacimiento).toStrictEqual(dc("ilegible", "<", 0));
    expect(n.valido).toBe(false);
  });

  it("MZ-09 el compuesto cubre cada zona de datos y excluye el sexo y la nacionalidad", () => {
    // Cambiar el sexo o la nacionalidad no altera el compuesto (columnas 7 y 15-17 de la línea 2 fuera).
    expect(aceptado(parsearB({ l2: "9007150M3407150COL9999123456<5" })).digitosControl.compuesto).toStrictEqual(
      dc("valido", "5", 5),
    );
    expect(aceptado(parsearB({ l2: "9007150F3407150VEN9999123456<5" })).digitosControl.compuesto).toStrictEqual(
      dc("valido", "5", 5),
    );
    // Columna 29 de la línea 1 (posición 24 del compuesto, peso 7) y columna 28 de la línea 2 (posición 49,
    // peso 3) sí están cubiertas: un "1" suma 7 y 3 a la suma de B (que da 5).
    expect(aceptado(parsearB({ l1: "ICCOL999900123816001<<<<<<<<<1" })).digitosControl.compuesto).toStrictEqual(
      dc("invalido", "5", 2),
    );
    expect(aceptado(parsearB({ l2: "9007150F3407150COL99991234561" + "5" })).digitosControl.compuesto).toStrictEqual(
      dc("invalido", "5", 8),
    );
    // Columna 5 de la línea 1 (posición 0, peso 7): 9 -> 8 resta 7.
    expect(aceptado(parsearB({ l1: "ICCOL899900123816001<<<<<<<<<<" })).digitosControl.compuesto).toStrictEqual(
      dc("invalido", "5", 8),
    );
  });
});

describe("MZ-10 serial del documento", () => {
  it("MZ-10 Serial con ceros a la izquierda", () => {
    const r = aceptado(parsearMrzCedulaDigital(["ICCOL000000012516001<<<<<<<<<<", "9007150F3407150COL9999123456<1", B3], REF));
    expect(r.campos.serial).toBe("000000012");
    expect(r.digitosControl.serial).toStrictEqual(dc("valido", "5", 5));
    expect(r.valido).toBe(true);
  });

  it("MZ-10 Dígito del serial ausente", () => {
    const r = aceptado(parsearMrzCedulaDigital(["ICCOL999900123<16001<<<<<<<<<<", "9007150F3407150COL9999123456<9", B3], REF));
    expect(r.digitosControl.serial).toStrictEqual(dc("ausente", "<", 8));
    expect(r.digitosControl.compuesto).toStrictEqual(dc("valido", "9", 9));
    expect(r.campos.serial).toBe("999900123");
    expect(r.valido).toBe(true);
  });

  it("MZ-10 serial con relleno no es de 9 cifras", () => {
    const r = aceptado(parsearMrzCedulaDigital(["ICCOL99990012<016001<<<<<<<<<<", "9007150F3407150COL9999123456<4", B3], REF));
    expect(r.campos.serial).toBeNull();
    expect(r.errores).toStrictEqual(["serial-invalido"]);
    expect(r.valido).toBe(false);
  });
});

describe("MZ-17 errores de campo y validez global (dígitos)", () => {
  it("MZ-17 valido es true en B y false si cualquiera de los cuatro dígitos no es valido", () => {
    expect(aceptado(parsearB()).valido).toBe(true);
    expect(aceptado(parsearB()).errores).toStrictEqual([]);
  });
});

describe("MZ-20 casos de referencia públicos como negativos", () => {
  it("MZ-20 Compuesto con la forma del espécimen back-ccd.png", () => {
    // M04 confirmada con corrección: dígito del serial "<", opcional vacío, compuesto impreso 9 y calculado 8.
    const r = aceptado(
      parsearMrzCedulaDigital(["ICCOL999900123<<<<<<<<<<<<<<<<", "9007150F3407150COL9999123453<9", B3], REF),
    );
    expect(r.digitosControl).toStrictEqual({
      serial: dc("ausente", "<", 8),
      nacimiento: dc("valido", "0", 0),
      vencimiento: dc("valido", "0", 0),
      compuesto: dc("invalido", "9", 8),
    });
    expect(r.campos.codigoLugarMrz).toBeNull();
    expect(r.campos.nuip).toBe("9999123453");
    expect(r.errores).toStrictEqual([]);
    expect(r.warnings).toStrictEqual([]);
    expect(r.valido).toBe(false);
  });
});

const corr = (linea: number, columna: number, original: string, corregido: string) => ({
  linea,
  columna,
  original,
  corregido,
});

describe("MZ-06 identificación de la cédula digital (corrección del emisor)", () => {
  it("MZ-06 País emisor C0L", () => {
    const r = aceptado(parsearB({ l1: "ICC0L999900123816001<<<<<<<<<<" }));
    expect(r.correcciones).toStrictEqual([corr(1, 3, "0", "O")]);
    expect(r.lineasCorregidas).toStrictEqual([B1, B2, B3]);
    expect(r.valido).toBe(true);
  });
});

describe("MZ-07 corrección OCR-B solo en zonas numéricas", () => {
  it("MZ-07 Confusiones OCR-B en todas las zonas numéricas", () => {
    const r = aceptado(
      parsearMrzCedulaDigital(["ICCOL9999OO123BI6001<<<<<<<<<<", "9Q071S0F3407I50C0L99991Z345G<S", B3], REF),
    );
    expect(r.correcciones).toStrictEqual([
      corr(1, 9, "O", "0"),
      corr(1, 10, "O", "0"),
      corr(1, 14, "B", "8"),
      corr(1, 15, "I", "1"),
      corr(2, 1, "Q", "0"),
      corr(2, 5, "S", "5"),
      corr(2, 12, "I", "1"),
      corr(2, 16, "0", "O"),
      corr(2, 23, "Z", "2"),
      corr(2, 27, "G", "6"),
      corr(2, 29, "S", "5"),
    ]);
    expect(r.lineasCorregidas).toStrictEqual([B1, B2, B3]);
    expect(r.campos.serial).toBe("999900123");
    expect(r.campos.codigoLugarMrz).toBe("16001");
    expect(r.valido).toBe(true);
  });

  it("MZ-07 Letras confundibles en los nombres no se tocan", () => {
    const r = aceptado(parsearB({ l3: "BOZGIS<QUIROS<<SOL<<<<<<<<<<<<" }));
    expect(r.correcciones).toStrictEqual([]);
    expect(r.lineasCorregidas[2]).toBe("BOZGIS<QUIROS<<SOL<<<<<<<<<<<<");
    expect(r.valido).toBe(true);
  });

  it("MZ-07 Letra fuera de la tabla en una zona numérica", () => {
    const r = aceptado(parsearB({ l1: "ICCOL99990012X816001<<<<<<<<<<" }));
    expect(r.campos.serial).toBeNull();
    expect(r.errores).toStrictEqual(["serial-invalido"]);
    expect(r.digitosControl.serial).toStrictEqual(dc("valido", "8", 8));
    expect(r.digitosControl.compuesto).toStrictEqual(dc("valido", "5", 5));
    expect(r.correcciones).toStrictEqual([]);
    expect(r.valido).toBe(false);
  });

  it("MZ-07 cada letra de la tabla se corrige en cada zona numérica y las demás letras no", () => {
    // Una letra de la tabla en el primer y el último carácter de cada zona.
    const r = aceptado(parsearMrzCedulaDigital(["ICCOLG99900123B16001<<<<<<<<<<", "S007150F3407150COL9999123456<5", B3], REF));
    expect(r.correcciones).toStrictEqual([corr(1, 5, "G", "6"), corr(1, 14, "B", "8"), corr(2, 0, "S", "5")]);
    expect(r.lineasCorregidas[0]).toBe("ICCOL699900123816001<<<<<<<<<<");
    const z = aceptado(parsearB({ l2: "900715OF340715OCOL999912345Z<Z" }));
    expect(z.correcciones).toStrictEqual([
      corr(2, 6, "O", "0"),
      corr(2, 14, "O", "0"),
      corr(2, 27, "Z", "2"),
      corr(2, 29, "Z", "2"),
    ]);
    const q = aceptado(parsearB({ l2: "9007150FQ407150COLQ999123456<5" }));
    expect(q.correcciones).toStrictEqual([corr(2, 8, "Q", "0"), corr(2, 18, "Q", "0")]);
    for (const letra of ["A", "D", "L", "T", "U", "X"]) {
      const s = aceptado(parsearB({ l1: "ICCOL" + letra + "99900123816001<<<<<<<<<<" }));
      expect(s.correcciones).toStrictEqual([]);
      expect(s.lineasCorregidas[0]).toBe("ICCOL" + letra + "99900123816001<<<<<<<<<<");
    }
  });

  it("MZ-07 fuera de las zonas numéricas nada se corrige: sexo, relleno de la línea 1 y línea 3", () => {
    const r = aceptado(parsearMrzCedulaDigital([B1, "9007150O3407150COL9999123456<5", "OIZSGBQ<<OIZSGBQ<<<<<<<<<<<<<<"], REF));
    expect(r.correcciones).toStrictEqual([]);
    expect(r.lineasCorregidas[1]).toBe("9007150O3407150COL9999123456<5");
    expect(r.lineasCorregidas[2]).toBe("OIZSGBQ<<OIZSGBQ<<<<<<<<<<<<<<");
    const s = aceptado(parsearB({ l1: "ICCOL999900123816001<<<<<<<<<O" }));
    expect(s.correcciones).toStrictEqual([]);
    expect(s.lineasCorregidas[0]).toBe("ICCOL999900123816001<<<<<<<<<O");
  });

  it("MZ-07 la normalización no se registra como corrección", () => {
    const r = aceptado(parsearB({ l1: " iccol999900123816001<<<<<<<<<<\r\n" }));
    expect(r.correcciones).toStrictEqual([]);
    expect(r.lineasCorregidas[0]).toBe(B1);
  });
});

describe("MZ-11 código de lugar en el opcional de la línea 1", () => {
  it("MZ-11 Código de lugar presente", () => {
    const r = aceptado(parsearB());
    expect(r.campos.codigoLugarMrz).toBe("16001");
    expect(r.warnings).toContain("M03");
  });

  it("MZ-11 Opcional vacío", () => {
    const r = aceptado(parsearB({ l1: "ICCOL9999001238<<<<<<<<<<<<<<<" }));
    expect(r.campos.codigoLugarMrz).toBeNull();
    expect(r.warnings).toStrictEqual([]);
    expect(r.valido).toBe(true);
  });

  it("MZ-11 Opcional con letra no corregible", () => {
    const r = aceptado(parsearMrzCedulaDigital(["ICCOL9999001238I6A01<<<<<<<<<<", "9007150F3407150COL9999123456<6", B3], REF));
    expect(r.campos.codigoLugarMrz).toBeNull();
    expect(r.correcciones).toStrictEqual([]);
    expect(r.lineasCorregidas[0]).toBe("ICCOL9999001238I6A01<<<<<<<<<<");
    expect(r.warnings).toStrictEqual([]);
    expect(r.valido).toBe(true);
  });

  it("MZ-11 Opcional corregible", () => {
    const r = aceptado(parsearB({ l1: "ICCOL9999001238I600I<<<<<<<<<<" }));
    expect(r.campos.codigoLugarMrz).toBe("16001");
    expect(r.correcciones).toStrictEqual([corr(1, 15, "I", "1"), corr(1, 19, "I", "1")]);
    expect(r.lineasCorregidas[0]).toBe(B1);
    expect(r.valido).toBe(true);
  });

  it("MZ-11 Resto del opcional no vacío", () => {
    const r = aceptado(parsearMrzCedulaDigital(["ICCOL999900123816001<<<<<<<<<X", "9007150F3407150COL9999123456<6", B3], REF));
    expect(r.campos.codigoLugarMrz).toBeNull();
    expect(r.warnings).toStrictEqual([]);
    expect(r.valido).toBe(true);
  });

  it("MZ-11 opcional corregible con resto no vacío o con 4 cifras: no se corrige nada", () => {
    const r = aceptado(parsearB({ l1: "ICCOL9999001238I600I<<<<<<<<<X" }));
    expect(r.campos.codigoLugarMrz).toBeNull();
    expect(r.correcciones).toStrictEqual([]);
    expect(r.lineasCorregidas[0]).toBe("ICCOL9999001238I600I<<<<<<<<<X");
    const c = aceptado(parsearB({ l1: "ICCOL9999001238I600<<<<<<<<<<<" }));
    expect(c.campos.codigoLugarMrz).toBeNull();
    expect(c.correcciones).toStrictEqual([]);
    expect(c.lineasCorregidas[0]).toBe("ICCOL9999001238I600<<<<<<<<<<<");
    const p = aceptado(parsearB({ l1: "ICCOL9999001238<6001<<<<<<<<<<" }));
    expect(p.campos.codigoLugarMrz).toBeNull();
    // Relleno en la columna 20, primera del resto: el código sigue presente.
    const q = aceptado(parsearB({ l1: "ICCOL999900123816001<<<<<<<<<<" }));
    expect(q.campos.codigoLugarMrz).toBe("16001");
    const u = aceptado(parsearB({ l1: "ICCOL999900123816001X<<<<<<<<<" }));
    expect(u.campos.codigoLugarMrz).toBeNull();
  });
});

describe("MZ-13 fechas con regla de siglo explícita", () => {
  it("MZ-13 Nacimiento en el siglo XX y en el XXI", () => {
    expect(aceptado(parsearB()).campos.fechaNacimiento).toBe("1990-07-15");
    expect(aceptado(parsearB({ l2: "0403151F3407150COL9999123456<3" })).campos.fechaNacimiento).toBe("2004-03-15");
  });

  it("MZ-13 Frontera de la fecha de referencia", () => {
    expect(aceptado(parsearB({ l2: "2610069F3407150COL9999123456<9" })).campos.fechaNacimiento).toBe("2026-10-06");
    expect(aceptado(parsearB({ l2: "2610070F3407150COL9999123456<9" })).campos.fechaNacimiento).toBe("1926-10-07");
  });

  it("MZ-13 La fecha de referencia decide el siglo", () => {
    expect(aceptado(parsearB({}, { fechaReferencia: "2090-07-14" })).campos.fechaNacimiento).toBe("1990-07-15");
    expect(aceptado(parsearB({}, { fechaReferencia: "2090-07-15" })).campos.fechaNacimiento).toBe("2090-07-15");
  });

  it("MZ-13 Año bisiesto y fecha inexistente", () => {
    const b = aceptado(parsearB({ l2: "0002299F3407150COL9999123456<9" }));
    expect(b.campos.fechaNacimiento).toBe("2000-02-29");
    expect(b.valido).toBe(true);
    const r = aceptado(parsearB({ l2: "9002306F3407150COL9999123456<5" }));
    expect(r.campos.fechaNacimiento).toBeNull();
    expect(r.errores).toStrictEqual(["fecha-nacimiento-invalida"]);
    expect(r.digitosControl.nacimiento).toStrictEqual(dc("valido", "6", 6));
    expect(r.valido).toBe(false);
  });

  it("MZ-13 el siglo se decide antes de comprobar la fecha: 29 de febrero de 1900 no existe", () => {
    const r = aceptado(parsearB({ l2: "0002299F3407150COL9999123456<9" }, { fechaReferencia: "2000-02-28" }));
    expect(r.campos.fechaNacimiento).toBeNull();
    expect(r.errores).toStrictEqual(["fecha-nacimiento-invalida"]);
  });

  it("MZ-13 Vencimiento siempre en el siglo XXI y sin juicio de vigencia", () => {
    const casos: [string, string][] = [
      [B2, "2034-07-15"],
      ["9007150F9901018COL9999123456<9", "2099-01-01"],
      ["9007150F2001012COL9999123456<3", "2020-01-01"],
    ];
    for (const [l2, vencimiento] of casos) {
      const r = aceptado(parsearB({ l2 }));
      expect(r.campos.fechaVencimiento).toBe(vencimiento);
      expect(r.valido).toBe(true);
    }
  });

  it("MZ-13 Vencimiento inexistente", () => {
    const r = aceptado(parsearB({ l2: "9007150F3402317COL9999123456<9" }));
    expect(r.campos.fechaVencimiento).toBeNull();
    expect(r.errores).toStrictEqual(["fecha-vencimiento-invalida"]);
    expect(r.valido).toBe(false);
  });

  it("MZ-13 fechas que no son 6 cifras tras la corrección", () => {
    const n = aceptado(parsearB({ l2: "90071X0F3407150COL9999123456<5" }));
    expect(n.campos.fechaNacimiento).toBeNull();
    expect(n.errores).toStrictEqual(["fecha-nacimiento-invalida"]);
    const v = aceptado(parsearB({ l2: "9007150F3407<50COL9999123456<5" }));
    expect(v.campos.fechaVencimiento).toBeNull();
    expect(v.errores).toStrictEqual(["fecha-vencimiento-invalida"]);
  });

  it("MZ-13 meses y días fuera de rango en el nacimiento y el vencimiento", () => {
    for (const fecha of ["900015", "901315", "900700", "900732", "900431", "010229"]) {
      const r = aceptado(parsearB({ l2: fecha + "0F3407150COL9999123456<5" }));
      expect(r.campos.fechaNacimiento).toBeNull();
      expect(r.campos.fechaVencimiento).toBe("2034-07-15");
      const v = aceptado(parsearB({ l2: "9007150F" + fecha + "0COL9999123456<5" }));
      expect(v.campos.fechaVencimiento).toBeNull();
      expect(v.campos.fechaNacimiento).toBe("1990-07-15");
    }
    expect(aceptado(parsearB({ l2: "9007150F0002290COL9999123456<5" })).campos.fechaVencimiento).toBe("2000-02-29");
    expect(aceptado(parsearB({ l2: "9007150F9612310COL9999123456<5" })).campos.fechaVencimiento).toBe("2096-12-31");
  });
});

describe("MZ-14 sexo", () => {
  it("MZ-14 Masculino, no especificado e inválido", () => {
    const sexo = (c: string) => aceptado(parsearB({ l2: "9007150" + c + "3407150COL9999123456<5" }));
    expect(sexo("M").campos.sexo).toBe("M");
    expect(sexo("<").campos.sexo).toBe("X");
    expect(sexo("X").campos.sexo).toBe("X");
    expect(sexo("F").campos.sexo).toBe("F");
    for (const c of ["H", "O"]) {
      const r = sexo(c);
      expect(r.campos.sexo).toBeNull();
      expect(r.errores).toStrictEqual(["sexo-invalido"]);
      expect(r.correcciones).toStrictEqual([]);
    }
    expect(sexo("M").errores).toStrictEqual([]);
    expect(sexo("<").errores).toStrictEqual([]);
    expect(sexo("0").campos.sexo).toBeNull();
  });

  it("MZ-14 Apellido con M y sexo femenino", () => {
    const r = aceptado(parsearB({ l3: "MUESTRA<MODELO<<MARIA<<<<<<<<<" }));
    expect(r.campos.sexo).toBe("F");
    expect(r.campos.apellidos).toBe("MUESTRA MODELO");
  });
});

describe("MZ-15 nacionalidad", () => {
  it("MZ-15 Nacionalidad leída como C0L", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407150C0L9999123456<5" }));
    expect(r.correcciones).toStrictEqual([corr(2, 16, "0", "O")]);
    expect(r.campos.nacionalidad).toBe("COL");
    expect(r.lineasCorregidas[1]).toBe(B2);
    expect(r.valido).toBe(true);
  });

  it("MZ-15 Otra nacionalidad", () => {
    for (const l2 of ["9007150F3407150VEN9999123456<5", "9007150F3407150CO19999123456<5"]) {
      const r = aceptado(parsearB({ l2 }));
      expect(r.campos.nacionalidad).toBeNull();
      expect(r.errores).toStrictEqual(["nacionalidad-invalida"]);
      expect(r.correcciones).toStrictEqual([]);
      expect(r.lineasCorregidas[1]).toBe(l2);
      expect(r.valido).toBe(false);
    }
  });

  it("MZ-15 un 0 en otra columna del país no produce COL", () => {
    const r = aceptado(parsearB({ l2: "9007150F34071500OL9999123456<5" }));
    expect(r.campos.nacionalidad).toBeNull();
    expect(r.correcciones).toStrictEqual([]);
  });
});

describe("MZ-12 NUIP en el opcional de la línea 2", () => {
  it("MZ-12 NUIP de 10 cifras", () => {
    const r = aceptado(parsearB());
    expect(r.campos.nuip).toBe("9999123456");
    expect(r.campos.nuipTipoProbable).toBe("nuip");
  });

  it("MZ-12 Número de 11 cifras rechazado", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407150COL999912345676" }));
    expect(r.campos.nuip).toBeNull();
    expect(r.campos.nuipTipoProbable).toBeNull();
    expect(r.errores).toStrictEqual(["nuip-invalido"]);
    expect(r.digitosControl.compuesto).toStrictEqual(dc("valido", "6", 6));
    expect(r.warnings).toStrictEqual(["M03"]);
    expect(r.valido).toBe(false);
  });

  it("MZ-12 Cero a la izquierda", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407150COL099991234565" }));
    expect(r.campos.nuip).toBe("9999123456");
    expect(r.campos.nuipTipoProbable).toBe("nuip");
  });

  it("MZ-12 Cédula antigua de 8 cifras", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407150COL99991234<<<8" }));
    expect(r.campos.nuip).toBe("99991234");
    expect(r.campos.nuipTipoProbable).toBe("cedula-antigua");
    expect(r.valido).toBe(true);
  });

  it("MZ-12 NUIP corto, vacío o con hueco", () => {
    for (const l2 of [
      "9007150F3407150COL9999<<<<<<<0",
      "9007150F3407150COL<<<<<<<<<<<8",
      "9007150F3407150COL99991234<561",
    ]) {
      const r = aceptado(parsearB({ l2 }));
      expect(r.campos.nuip).toBeNull();
      expect(r.campos.nuipTipoProbable).toBeNull();
      expect(r.errores).toStrictEqual(["nuip-invalido"]);
      expect(r.digitosControl.compuesto.estado).toBe("valido");
      expect(r.valido).toBe(false);
    }
  });

  it("MZ-12 cédula antigua de 5 cifras y letra fuera de la tabla OCR-B", () => {
    const c = aceptado(parsearB({ l2: "9007150F3407150COL99991<<<<<<5" }));
    expect(c.campos.nuip).toBe("99991");
    expect(c.campos.nuipTipoProbable).toBe("cedula-antigua");
    expect(c.warnings).toStrictEqual(["M03"]);
    const x = aceptado(parsearB({ l2: "9007150F3407150COL99991234X6<5" }));
    expect(x.campos.nuip).toBeNull();
    expect(x.errores).toStrictEqual(["nuip-invalido"]);
  });
});

describe("MZ-16 apellidos y nombres", () => {
  it("MZ-16 Apellido compuesto con un solo separador", () => {
    const r = aceptado(parsearB({ l3: "DE<LA<OSSA<FICTICIO<<ANA<<<<<<" }));
    expect(r.campos.apellidos).toBe("DE LA OSSA FICTICIO");
    expect(r.campos.nombres).toBe("ANA");
    expect(r.valido).toBe(true);
  });

  it("MZ-16 Nombres truncados", () => {
    const r = aceptado(parsearB({ l3: "FICTICIO<EJEMPLO<<MARIA<FERNAN" }));
    expect(r.campos.nombres).toBe("MARIA FERNAN");
    expect(r.campos.nombresPosiblementeTruncados).toBe(true);
    expect(r.valido).toBe(true);
  });

  it("MZ-16 Solo apellido", () => {
    const r = aceptado(parsearB({ l3: "FICTICIO<<<<<<<<<<<<<<<<<<<<<<" }));
    expect(r.campos.apellidos).toBe("FICTICIO");
    expect(r.campos.nombres).toBe("");
    expect(r.campos.nombresPosiblementeTruncados).toBe(false);
  });

  it("MZ-16 Cifra en el nombre", () => {
    const r = aceptado(parsearB({ l3: "FICTICI0<EJEMPLO<<ANA<MARIA<<<" }));
    expect(r.campos.apellidos).toBe("FICTICI0 EJEMPLO");
    expect(r.correcciones).toStrictEqual([]);
    expect(r.errores).toStrictEqual(["nombre-no-alfabetico"]);
    expect(r.valido).toBe(false);
  });

  it("MZ-16 solo el primer << separa; cada serie de < es un espacio; línea sin << ni relleno", () => {
    const r = aceptado(parsearB({ l3: "FICTICIO<<ANA<<MARIA<<<<<<<<<<" }));
    expect(r.campos.apellidos).toBe("FICTICIO");
    expect(r.campos.nombres).toBe("ANA MARIA");
    const s = aceptado(parsearB({ l3: "FICTICIOEJEMPLOANAMARIAABCDEFG" }));
    expect(s.campos.apellidos).toBe("FICTICIOEJEMPLOANAMARIAABCDEFG");
    expect(s.campos.nombres).toBe("");
    expect(s.campos.nombresPosiblementeTruncados).toBe(true);
    const v = aceptado(parsearB({ l3: "<".repeat(30) }));
    expect(v.campos.apellidos).toBe("");
    expect(v.campos.nombres).toBe("");
    expect(v.campos.nombresPosiblementeTruncados).toBe(false);
    const c = aceptado(parsearB({ l3: "FICTICIO<EJEMPLO<<ANA<MARIA<<9" }));
    expect(c.errores).toStrictEqual(["nombre-no-alfabetico"]);
  });
});

describe("MZ-18 warnings de hipótesis", () => {
  it("MZ-18 Warnings por caso", () => {
    expect(aceptado(parsearB()).warnings).toStrictEqual(["M03"]);
    expect(aceptado(parsearB({ l1: "ICCOL9999001238<<<<<<<<<<<<<<<" })).warnings).toStrictEqual([]);
    expect(aceptado(parsearB({ l2: "9007150F3407150COL999912345676" })).warnings).toStrictEqual(["M03"]);
  });
});

describe("MZ-17 errores de campo y validez global", () => {
  it("MZ-17 Varios errores en orden fijo", () => {
    const r = aceptado(
      parsearMrzCedulaDigital([B1, "9002306H3407150VEN9999<<<<<<<0", "FICTICI0<EJEMPLO<<ANA<MARIA<<<"], REF),
    );
    expect(r.errores).toStrictEqual([
      "fecha-nacimiento-invalida",
      "sexo-invalido",
      "nacionalidad-invalida",
      "nuip-invalido",
      "nombre-no-alfabetico",
    ]);
    for (const d of Object.values(r.digitosControl)) expect(d.estado).toBe("valido");
    expect(r.valido).toBe(false);
  });

  it("MZ-17 serial y vencimiento inválidos van primero y cuarto", () => {
    const r = aceptado(
      parsearMrzCedulaDigital(["ICCOL99990012X816001<<<<<<<<<<", "9007150<3402317COL9999123456<9", B3], REF),
    );
    expect(r.errores).toStrictEqual(["serial-invalido", "fecha-vencimiento-invalida"]);
  });
});

/** R1: resultado completo de B (MZ-01), literal de la spec. */
const R1 = {
  ok: true,
  valido: true,
  campos: {
    serial: "999900123",
    codigoLugarMrz: "16001",
    fechaNacimiento: "1990-07-15",
    sexo: "F",
    fechaVencimiento: "2034-07-15",
    nacionalidad: "COL",
    nuip: "9999123456",
    nuipTipoProbable: "nuip",
    apellidos: "FICTICIO EJEMPLO",
    nombres: "ANA MARIA",
    nombresPosiblementeTruncados: false,
  },
  digitosControl: {
    serial: { estado: "valido", leido: "8", calculado: 8 },
    nacimiento: { estado: "valido", leido: "0", calculado: 0 },
    vencimiento: { estado: "valido", leido: "0", calculado: 0 },
    compuesto: { estado: "valido", leido: "5", calculado: 5 },
  },
  correcciones: [],
  errores: [],
  warnings: ["M03"],
  lineasCorregidas: [
    "ICCOL999900123816001<<<<<<<<<<",
    "9007150F3407150COL9999123456<5",
    "FICTICIO<EJEMPLO<<ANA<MARIA<<<",
  ],
};

describe("resultado completo (tarea 4.4)", { timeout: 60_000 }, () => {
  it("MZ-01 Cédula sintética válida completa (R1)", () => {
    expect(parsearMrzCedulaDigital([B1, B2, B3], REF)).toStrictEqual(R1);
  });

  it("MZ-02 Determinismo y argumentos intactos", () => {
    const lineas = Object.freeze([B1, B2, B3]);
    const opciones = Object.freeze({ fechaReferencia: "2026-10-06" });
    expect(parsearMrzCedulaDigital(lineas, opciones)).toStrictEqual(R1);
    expect(parsearMrzCedulaDigital(lineas, opciones)).toStrictEqual(R1);
  });

  it("MZ-02 Nunca lanza con opciones arbitrarias, mezcladas con opciones válidas", () => {
    const fechaValida = fc
      .record({ anio: fc.integer({ min: 2000, max: 2099 }), mes: fc.integer({ min: 1, max: 12 }), dia: fc.integer({ min: 1, max: 28 }) })
      .map(({ anio, mes, dia }) => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
    const opciones = fc.oneof(
      fc.anything(),
      fc.record({ fechaReferencia: fechaValida }),
      fc.tuple(fechaValida, fc.dictionary(fc.string(), fc.anything())).map(([f, extra]) => ({ ...extra, fechaReferencia: f })),
    );
    let aceptadas = 0;
    fc.assert(
      fc.property(opciones, (o) => {
        const r = parsearMrzCedulaDigital([B1, B2, B3], o);
        if (r.ok) {
          aceptadas++;
          expect(r.valido).toBe(true);
          // MZ-13: 900715 es 2090-07-15 solo si la referencia es esa fecha o posterior.
          const referencia = (o as { fechaReferencia: string }).fechaReferencia;
          expect(r.campos.fechaNacimiento).toBe(referencia >= "2090-07-15" ? "2090-07-15" : "1990-07-15");
        } else {
          expect(r).toStrictEqual(rechazo("fecha-referencia-invalida"));
        }
      }),
      { numRuns: 1000 },
    );
    // Vacuidad: la rama ok: true se ejerce en una fracción relevante de los casos.
    expect(aceptadas).toBeGreaterThan(300);
  });

  it("MZ-04 Límites admitidos (valido: true)", () => {
    for (const fechaReferencia of ["2000-02-29", "2099-12-31"]) {
      const r = aceptado(parsearB({}, { fechaReferencia }));
      expect(r.valido).toBe(true);
    }
  });

  it("MZ-05 Espacios, saltos y minúsculas del OCR", () => {
    expect(
      parsearMrzCedulaDigital(
        [" iccol999900123816001<<<<<<<<<<\r\n", "9007150F 3407150COL 9999123456<5", "FICTICIO<EJEMPLO<<ANA<MARIA<<<\t"],
        REF,
      ),
    ).toStrictEqual(R1);
  });

  it("MZ-06 País emisor C0L (R1 salvo correcciones)", () => {
    expect(parsearB({ l1: "ICC0L999900123816001<<<<<<<<<<" })).toStrictEqual({
      ...R1,
      correcciones: [corr(1, 3, "0", "O")],
    });
  });

  it("MZ-07 Confusiones OCR-B en todas las zonas numéricas (R1 salvo correcciones)", () => {
    expect(
      parsearMrzCedulaDigital(["ICCOL9999OO123BI6001<<<<<<<<<<", "9Q071S0F3407I50C0L99991Z345G<S", B3], REF),
    ).toStrictEqual({
      ...R1,
      correcciones: [
        corr(1, 9, "O", "0"),
        corr(1, 10, "O", "0"),
        corr(1, 14, "B", "8"),
        corr(1, 15, "I", "1"),
        corr(2, 1, "Q", "0"),
        corr(2, 5, "S", "5"),
        corr(2, 12, "I", "1"),
        corr(2, 16, "0", "O"),
        corr(2, 23, "Z", "2"),
        corr(2, 27, "G", "6"),
        corr(2, 29, "S", "5"),
      ],
    });
  });

  it("MZ-15 Nacionalidad leída como C0L (R1 salvo correcciones)", () => {
    expect(parsearB({ l2: "9007150F3407150C0L9999123456<5" })).toStrictEqual({
      ...R1,
      correcciones: [corr(2, 16, "0", "O")],
    });
  });

  it("MZ-20 Espécimen anterior publicado por Eitol", () => {
    const r = aceptado(
      parsearMrzCedulaDigital(
        ["ICCOL000000012305001<<<<<<<<<<", "0403151F3203190C0L1234567890<0", "WALTEROS<<LAURA<<<<<<<<<<<<<<<"],
        REF,
      ),
    );
    expect(r.campos).toStrictEqual({
      serial: "000000012",
      codigoLugarMrz: "05001",
      fechaNacimiento: "2004-03-15",
      sexo: "F",
      fechaVencimiento: "2032-03-19",
      nacionalidad: "COL",
      nuip: "1234567890",
      nuipTipoProbable: "nuip",
      apellidos: "WALTEROS",
      nombres: "LAURA",
      nombresPosiblementeTruncados: false,
    });
    expect(r.digitosControl).toStrictEqual({
      serial: dc("invalido", "3", 5),
      nacimiento: dc("valido", "1", 1),
      vencimiento: dc("valido", "0", 0),
      compuesto: dc("invalido", "0", 5),
    });
    expect(r.correcciones).toStrictEqual([corr(2, 16, "0", "O")]);
    expect(r.errores).toStrictEqual([]);
    expect(r.valido).toBe(false);
  });

  it("MZ-19 El resultado no trae RH", () => {
    const r = aceptado(parsearB());
    for (const clave of Object.keys(r.campos)) {
      expect(clave).not.toMatch(/^rh$/i);
      expect(clave).not.toMatch(/grupoSanguineo/i);
      expect(clave).not.toMatch(/qr/i);
    }
    for (const clave of Object.keys(r)) expect(clave).not.toMatch(/qr|^rh$/i);
  });

  it("MZ-19 Ningún export de QR", async () => {
    const paquete = await import("../src/index.js");
    const nombres = Object.keys(paquete);
    expect(nombres).toContain("parsearMrzCedulaDigital");
    expect(nombres).toContain("digitoControlIcao");
    for (const nombre of nombres) expect(nombre).not.toMatch(/qr/i);
  });

  it("MZ-17 valido es false si cualquiera de los cuatro dígitos no es valido, y true con el serial ausente", () => {
    // Cada caso altera solo un dígito (y el compuesto se recalcula a mano para dejarlo válido).
    const serialInvalido = aceptado(parsearMrzCedulaDigital(["ICCOL999900123716001<<<<<<<<<<", "9007150F3407150COL9999123456<8", B3], REF));
    expect(serialInvalido.digitosControl.compuesto.estado).toBe("valido");
    expect(serialInvalido.digitosControl.serial.estado).toBe("invalido");
    expect(serialInvalido.valido).toBe(false);
    const nacimientoInvalido = aceptado(parsearB({ l2: "9007151F3407150COL9999123456<8" }));
    expect(nacimientoInvalido.digitosControl.compuesto.estado).toBe("valido");
    expect(nacimientoInvalido.valido).toBe(false);
    const vencimientoInvalido = aceptado(parsearB({ l2: "9007150F3407151COL9999123456<6" }));
    expect(vencimientoInvalido.digitosControl.compuesto.estado).toBe("valido");
    expect(vencimientoInvalido.valido).toBe(false);
    const serialIlegible = aceptado(parsearMrzCedulaDigital(["ICCOL999900123X16001<<<<<<<<<<", "9007150F3407150COL9999123456<0", B3], REF));
    expect(serialIlegible.digitosControl.compuesto.estado).toBe("valido");
    expect(serialIlegible.valido).toBe(false);
  });
});

describe("casos que dejó al descubierto la mutación (tarea 4.4)", () => {
  it("MZ-04 una fecha de referencia que no es string se rechaza aunque su texto sea una fecha válida", () => {
    const comoTexto = { toString: () => "2026-10-06" };
    for (const fechaReferencia of [["2026-10-06"], comoTexto, new String("2026-10-06")]) {
      expect(parsearB({}, { fechaReferencia })).toStrictEqual(rechazo("fecha-referencia-invalida"));
    }
  });

  it("MZ-04 la forma AAAA-MM-DD se exige de principio a fin", () => {
    for (const fechaReferencia of ["2026-10-062026-10-06", "12026-10-06", "2026-10-06\n", "2026-10-06" + "0".repeat(10_000)]) {
      expect(parsearB({}, { fechaReferencia })).toStrictEqual(rechazo("fecha-referencia-invalida"));
    }
  });

  it("MZ-12 un opcional que empieza por relleno no tiene NUIP aunque lo sigan 10 cifras", () => {
    const r = aceptado(parsearB({ l2: "9007150F3407150COL<99991234565" }));
    expect(r.campos.nuip).toBeNull();
    expect(r.campos.nuipTipoProbable).toBeNull();
    expect(r.errores).toStrictEqual(["nuip-invalido"]);
  });

  it("MZ-09 un dígito de control con letra no corregible o relleno es ilegible en cada posición", () => {
    const r = aceptado(parsearB({ l2: "900715AF340715AC0L9999123456<A" }));
    expect(r.digitosControl.nacimiento.estado).toBe("ilegible");
    expect(r.digitosControl.vencimiento.estado).toBe("ilegible");
    expect(r.digitosControl.compuesto.estado).toBe("ilegible");
    expect(r.digitosControl.nacimiento.leido).toBe("A");
  });
});

describe("MZ-23 Apellidos obligatorios", () => {
  function campos(l3: string) {
    const r = parsearB({ l3 });
    if (!r.ok) throw new Error("rechazo inesperado");
    return r;
  }

  it("MZ-23 Línea 3 solo de relleno", () => {
    const r = campos("<".repeat(30));
    expect([r.campos.apellidos, r.campos.nombres, r.errores, r.valido]).toStrictEqual(["", "", ["apellidos-vacios"], false]);
  });

  it("MZ-23 Línea 3 que empieza por el separador", () => {
    const r = campos("<<FICTICIO<<<<<<<<<<<<<<<<<<<<");
    expect([r.campos.apellidos, r.campos.nombres, r.errores, r.valido]).toStrictEqual(["", "FICTICIO", ["apellidos-vacios"], false]);
  });

  it("MZ-23 Junto con la cifra en el nombre", () => {
    expect(campos("<<AN4<<<<<<<<<<<<<<<<<<<<<<<<<").errores).toStrictEqual(["nombre-no-alfabetico", "apellidos-vacios"]);
  });

  it("MZ-23 un apellido de una letra sigue siendo válido", () => {
    expect(campos("X<<ANA<<<<<<<<<<<<<<<<<<<<<<<<").valido).toBe(true);
  });
});

describe("OFF-24 Tarjeta de identidad en MRZ (pwa-lectura-offline)", () => {
  it("OFF-24 un código de documento distinto de IC se rechaza como no-es-cedula-digital", () => {
    for (const codigo of ["IT", "TI", "ID"]) {
      expect(parsearB({ l1: codigo + B1.slice(2) })).toStrictEqual(rechazo("no-es-cedula-digital"));
    }
  });
});
