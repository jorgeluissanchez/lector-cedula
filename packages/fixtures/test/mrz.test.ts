// Datos sintéticos: MRZ TD1 de personas ficticias (NUIP y serial con prefijo 9999). El espécimen es el público de ICAO 9303.
import { describe, expect, it } from "vitest";
import { ErrorFixture } from "../src/errores.js";
import { generarMrzTd1 } from "../src/mrz.js";
import { PERSONA_BASE, type PersonaFicticia } from "../src/persona.js";

/**
 * Oráculo independiente del generador, escrito desde el texto de ICAO 9303 parte 3 (design.md, decisión 11):
 * tabla literal de valores (`0`-`9` valen su dígito, `A`-`Z` valen 10-35, `<` vale 0), pesos 7, 3, 1 repetidos
 * desde el primer carácter y suma módulo 10.
 */
const VALORES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function digitoIcao(campo: string): string {
  let suma = 0;
  [...campo].forEach((c, i) => {
    const valor = c === "<" ? 0 : VALORES.indexOf(c);
    if (valor < 0) throw new Error(`carácter no admitido por el oráculo: ${c}`);
    suma += valor * (i % 3 === 0 ? 7 : i % 3 === 1 ? 3 : 1);
  });
  return String(suma % 10);
}
const compuestoTd1 = (l1: string, l2: string): string => digitoIcao(l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29));

const L1_BASE = "ICCOL999912345516001<<<<<<<<<<";
const L2_BASE = "8503149F3503144COL9999123456<5";
const L3_BASE = "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<";
const con = (cambios: Record<string, unknown>): PersonaFicticia => ({ ...PERSONA_BASE, ...cambios }) as PersonaFicticia;
const generar = (persona: unknown, opciones?: unknown) => generarMrzTd1(persona as PersonaFicticia, opciones as undefined);

function capturar(fn: () => unknown): ErrorFixture {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorFixture);
    return e as ErrorFixture;
  }
  throw new Error("se esperaba ErrorFixture y no lanzó nada");
}

function esperarError(fn: () => unknown, codigo: string, campo?: string | null): void {
  const e = capturar(fn);
  expect(e.codigo).toBe(codigo);
  if (campo !== undefined) expect(e.campo).toBe(campo);
}

describe("FX-17 Dígitos de control ICAO 9303", { timeout: 60_000 }, () => {
  it("FX-17 Oráculo con el espécimen público de ICAO 9303", () => {
    const l1 = "I<UTOD231458907<<<<<<<<<<<<<<<";
    const l2 = "7408122F1204159UTO<<<<<<<<<<<6";
    expect(digitoIcao("D23145890")).toBe("7");
    expect(digitoIcao("740812")).toBe("2");
    expect(digitoIcao("120415")).toBe("9");
    expect(compuestoTd1(l1, l2)).toBe("6");
    expect([l1[14], l2[6], l2[14], l2[29]]).toStrictEqual(["7", "2", "9", "6"]);
  });

  it("FX-17 Valores literales de la persona base", () => {
    const [l1, l2] = generarMrzTd1(PERSONA_BASE).lineas;
    expect(l1[14]).toBe("5");
    expect(l2[6]).toBe("9");
    expect(l2[14]).toBe("4");
    expect(l2[29]).toBe("5");
  });

  it("FX-17 El oráculo confirma los cuatro dígitos de varias personas", () => {
    const personas = [
      PERSONA_BASE,
      con({ serialDocumento: "999900000", nuip: "9999000000", fechaNacimiento: "2000-02-29", fechaVencimiento: "2099-12-31" }),
      con({ serialDocumento: "999987654", nuip: "9999876543", fechaNacimiento: "1930-01-01", fechaVencimiento: "2030-10-20", lugarExpedicion: "88001", sexo: "M" }),
    ];
    for (const p of personas) {
      const [l1, l2] = generarMrzTd1(p).lineas;
      expect(l1[14]).toBe(digitoIcao(l1.slice(5, 14)));
      expect(l2[6]).toBe(digitoIcao(l2.slice(0, 6)));
      expect(l2[14]).toBe(digitoIcao(l2.slice(8, 14)));
      expect(l2[29]).toBe(compuestoTd1(l1, l2));
    }
  });
});

describe("FX-16 MRZ TD1 válida", { timeout: 60_000 }, () => {
  it("FX-16 MRZ de la persona base", () => {
    const f = generarMrzTd1(PERSONA_BASE);
    expect(f.lineas).toStrictEqual([L1_BASE, L2_BASE, L3_BASE]);
    expect(f.lineasSinErrores).toStrictEqual(f.lineas);
    expect(f.inyecciones).toStrictEqual([]);
    expect(f.texto).toBe(f.lineas.join("\n"));
  });

  it("FX-16 Esperado de la MRZ base", () => {
    expect(generarMrzTd1(PERSONA_BASE).esperado).toStrictEqual({
      serialDocumento: "999912345",
      lugarExpedicion: "16001",
      fechaNacimiento: "1985-03-14",
      sexo: "F",
      fechaVencimiento: "2035-03-14",
      nacionalidad: "COL",
      nuip: "9999123456",
      primerApellido: "PRUEBA",
      segundoApellido: "EJEMPLO",
      primerNombre: "FICTICIA",
      segundoNombre: "LUZ",
      digitosControl: { documento: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" },
    });
  });

  it("FX-16 Metadatos e inmutabilidad del fixture MRZ", () => {
    const f = generarMrzTd1(PERSONA_BASE, { semilla: 9 });
    expect(f.sintetico).toBe(true);
    expect(f.variante).toBe("valida");
    expect(f.semilla).toBe(9);
    expect(f.persona).toStrictEqual(PERSONA_BASE);
    expect(Object.keys(f).sort()).toStrictEqual([
      "esperado", "hipotesis", "inyecciones", "lineas", "lineasSinErrores", "persona", "semilla", "sintetico", "texto", "variante",
    ]);
    for (const valor of [f, f.lineas, f.lineasSinErrores, f.inyecciones, f.esperado, f.esperado.digitosControl, f.hipotesis, f.persona]) {
      expect(Object.isFrozen(valor)).toBe(true);
    }
    expect(() => {
      (f.esperado as { nuip: string }).nuip = "9999000000";
    }).toThrow(TypeError);
  });

  it("FX-16 Otra persona: sexo M, otro DIVIPOL y otras fechas", () => {
    const f = generar(con({ sexo: "M", lugarExpedicion: "00000", fechaNacimiento: "2007-12-31", fechaVencimiento: "2045-01-02", serialDocumento: "999900001", nuip: "9999000001" }));
    expect(f.lineas[0].slice(0, 14)).toBe("ICCOL999900001");
    expect(f.lineas[0].slice(15)).toBe("00000<<<<<<<<<<");
    expect(f.lineas[1].slice(0, 6)).toBe("071231");
    expect(f.lineas[1][7]).toBe("M");
    expect(f.lineas[1].slice(8, 14)).toBe("450102");
    expect(f.lineas[1].slice(15, 28)).toBe("COL9999000001");
    expect(f.lineas[1][28]).toBe("<");
    expect(f.esperado.sexo).toBe("M");
  });

  it("FX-16 NUIP corto en la MRZ", () => {
    esperarError(() => generar(con({ nuip: "99991234" })), "nuip-no-soportado-en-mrz", "nuip");
    esperarError(() => generar(con({ nuip: "999912345" })), "nuip-no-soportado-en-mrz", "nuip");
    esperarError(() => generar(con({ nuip: "99991" })), "nuip-no-soportado-en-mrz", "nuip");
  });

  it("FX-16 Todas las líneas miden 30 y usan solo A-Z, 0-9 y <", () => {
    for (const p of [PERSONA_BASE, con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }), con({ segundoNombre: "" })]) {
      for (const linea of generar(p).lineas) expect(linea).toMatch(/^[A-Z0-9<]{30}$/);
    }
  });
});

describe("FX-18 Línea 3 de la MRZ", { timeout: 60_000 }, () => {
  it("FX-18 Ñ transliterada", () => {
    const f = generar(con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }));
    expect(f.lineas[2]).toBe("PENA<NUNEZ<<FICTICIA<LUZ<<<<<<");
    expect(f.esperado.primerApellido).toBe("PENA");
    expect(f.esperado.segundoApellido).toBe("NUNEZ");
  });

  it("FX-18 Ñ transliterada en los nombres", () => {
    const f = generar(con({ primerNombre: "ÑOÑA", segundoNombre: "IÑIGO" }));
    expect(f.lineas[2]).toBe("PRUEBA<EJEMPLO<<NONA<INIGO<<<<");
    expect(f.esperado.primerNombre).toBe("NONA");
    expect(f.esperado.segundoNombre).toBe("INIGO");
  });

  it("FX-18 Apellido compuesto sin segundo nombre", () => {
    const f = generar(con({ primerApellido: "DE LA OSSA", segundoNombre: "" }));
    expect(f.lineas[2]).toBe("DE<LA<OSSA<EJEMPLO<<FICTICIA<<");
    expect(f.esperado.primerApellido).toBe("DE LA OSSA");
    expect(f.esperado.segundoNombre).toBe("");
    expect(f.lineas[0]).toBe(L1_BASE);
    expect(f.lineas[1]).toBe(L2_BASE);
  });

  it("FX-18 Segundo nombre compuesto", () => {
    expect(generar(con({ segundoNombre: "DEL CARMEN", primerNombre: "ANA" })).lineas[2]).toBe("PRUEBA<EJEMPLO<<ANA<DEL<CARMEN");
  });

  it("FX-18 Nombre que no cabe", () => {
    esperarError(() => generar(con({ primerApellido: "DE LA OSSA" })), "nombre-excede-mrz", null);
  });

  it("FX-18 Límite exacto de 30 caracteres", () => {
    // 10 + 1 + 7 + 2 + 8 + 1 + 1 = 30
    expect(generar(con({ primerApellido: "DE LA OSSA", segundoNombre: "A" })).lineas[2]).toBe("DE<LA<OSSA<EJEMPLO<<FICTICIA<A");
    // 31 caracteres
    esperarError(() => generar(con({ primerApellido: "DE LA OSSA", segundoNombre: "AB" })), "nombre-excede-mrz", null);
  });
});

describe("FX-14 Hipótesis declaradas (MRZ válida)", { timeout: 60_000 }, () => {
  it("FX-14 Hipótesis de la MRZ", () => {
    expect(generarMrzTd1(PERSONA_BASE, { variante: "valida" }).hipotesis).toStrictEqual(["G05", "M01", "M02", "M03"]);
  });
});

describe("FX-05 Nunca un número fuera del rango sintético (generarMrzTd1)", { timeout: 60_000 }, () => {
  it("FX-05 Cero inicial y once dígitos rechazados", () => {
    esperarError(() => generar(con({ nuip: "0999912345" })), "nuip-fuera-de-rango-sintetico", "nuip");
    esperarError(() => generar(con({ nuip: "99991234567" })), "nuip-fuera-de-rango-sintetico", "nuip");
  });

  it("FX-05 Serial fuera de rango", () => {
    esperarError(() => generar(con({ serialDocumento: "123456789" })), "serial-fuera-de-rango-sintetico", "serialDocumento");
  });
});

describe("FX-03 Validación de la persona y de las opciones (generarMrzTd1)", { timeout: 60_000 }, () => {
  it("FX-03 Persona base válida", () => {
    expect(generarMrzTd1(PERSONA_BASE).sintetico).toBe(true);
  });

  it("FX-03 Opciones inválidas (semilla)", () => {
    esperarError(() => generar(PERSONA_BASE, { semilla: 4294967296 }), "semilla-invalida", "semilla");
    esperarError(() => generar(PERSONA_BASE, { semilla: -1 }), "semilla-invalida", "semilla");
  });

  it("FX-03 Variante desconocida y opciones que no son objeto", () => {
    esperarError(() => generar(PERSONA_BASE, { variante: "completa" }), "variante-invalida", "variante");
    esperarError(() => generar(PERSONA_BASE, null), "variante-invalida", "opciones");
  });

  it("FX-03 Orden: persona, opciones y por último las restricciones de la MRZ", () => {
    esperarError(() => generar(con({ nuip: "123" }), { variante: "otra" }), "nuip-fuera-de-rango-sintetico", "nuip");
    esperarError(() => generar(con({ nuip: "99991234" }), { variante: "otra" }), "variante-invalida", "variante");
    esperarError(() => generar(con({ nuip: "99991234" }), { semilla: -1 }), "semilla-invalida", "semilla");
    esperarError(() => generar(con({ nuip: "99991234", primerApellido: "DE LA OSSA" })), "nuip-no-soportado-en-mrz", "nuip");
  });

  it("FX-03 Semilla por omisión y determinismo", () => {
    expect(generarMrzTd1(PERSONA_BASE)).toStrictEqual(generarMrzTd1(PERSONA_BASE, { semilla: 1 }));
    expect(generarMrzTd1(PERSONA_BASE).semilla).toBe(1);
    expect(generarMrzTd1(PERSONA_BASE, { semilla: 0 }).semilla).toBe(0);
  });
});

const VALIDOS = { documento: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" } as const;

/** Estado de los cuatro dígitos según el oráculo de la prueba (independiente del generador). */
function estadosSegunOraculo([l1, l2]: readonly [string, string, string]) {
  const estado = (impreso: string | undefined, campo: string) => (impreso === "<" ? "relleno" : impreso === digitoIcao(campo) ? "valido" : "invalido");
  return {
    documento: estado(l1[14], l1.slice(5, 14)),
    nacimiento: estado(l2[6], l2.slice(0, 6)),
    vencimiento: estado(l2[14], l2.slice(8, 14)),
    compuesto: estado(l2[29], l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29)),
  };
}

describe("FX-19 Dígitos de control alterados", { timeout: 60_000 }, () => {
  it("FX-19 Documento alterado", () => {
    const f = generarMrzTd1(PERSONA_BASE, { variante: "cd-documento-alterado" });
    expect(f.lineas[0]).toBe("ICCOL999912345616001<<<<<<<<<<");
    expect(f.lineas[1]).toBe("8503149F3503144COL9999123456<2");
    expect(f.esperado.digitosControl).toStrictEqual({ ...VALIDOS, documento: "invalido" });
  });

  it("FX-19 Nacimiento alterado", () => {
    const f = generarMrzTd1(PERSONA_BASE, { variante: "cd-nacimiento-alterado" });
    expect(f.lineas[0]).toBe(L1_BASE);
    expect(f.lineas[1]).toBe("8503140F3503144COL9999123456<8");
    expect(f.esperado.digitosControl).toStrictEqual({ ...VALIDOS, nacimiento: "invalido" });
  });

  it("FX-19 Vencimiento alterado", () => {
    const f = generarMrzTd1(PERSONA_BASE, { variante: "cd-vencimiento-alterado" });
    expect(f.lineas[0]).toBe(L1_BASE);
    expect(f.lineas[1]).toBe("8503149F3503145COL9999123456<6");
    expect(f.esperado.digitosControl).toStrictEqual({ ...VALIDOS, vencimiento: "invalido" });
  });

  it("FX-19 Compuesto alterado", () => {
    const f = generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" });
    expect(f.lineas[0]).toBe("ICCOL999912345516001<<<<<<<<<<");
    expect(f.lineas[1]).toBe("8503149F3503144COL9999123456<6");
    expect(f.esperado.digitosControl).toStrictEqual({ ...VALIDOS, compuesto: "invalido" });
  });

  it("FX-19 Dígito del documento como relleno", () => {
    const f = generarMrzTd1(PERSONA_BASE, { variante: "cd-documento-relleno" });
    expect(f.lineas[0]).toBe("ICCOL999912345<16001<<<<<<<<<<");
    expect(f.lineas[1]).toBe("8503149F3503144COL9999123456<0");
    expect(f.esperado.digitosControl).toStrictEqual({ ...VALIDOS, documento: "relleno" });
  });

  it("FX-19 La alteración da la vuelta de 9 a 0", () => {
    // Serial 999900007: dígito ICAO 9 (oráculo); alterado debe ser 0.
    const p = con({ serialDocumento: "999900007" });
    expect(digitoIcao("999900007")).toBe("9");
    expect(generarMrzTd1(p, { variante: "cd-documento-alterado" }).lineas[0][14]).toBe("0");
  });

  it("FX-19 El oráculo de la prueba coincide con el estado declarado en cada variante", () => {
    const variantes = ["valida", "cd-documento-alterado", "cd-nacimiento-alterado", "cd-vencimiento-alterado", "cd-compuesto-alterado", "cd-documento-relleno"] as const;
    for (const p of [PERSONA_BASE, con({ serialDocumento: "999900007", fechaNacimiento: "1999-09-09", nuip: "9999999999" })]) {
      for (const variante of variantes) {
        const f = generarMrzTd1(p, { variante });
        expect(estadosSegunOraculo(f.lineas), variante).toStrictEqual(f.esperado.digitosControl);
        expect(f.lineas[2]).toBe(generarMrzTd1(p).lineas[2]);
        expect(f.variante).toBe(variante);
        expect(f.lineasSinErrores).toStrictEqual(f.lineas);
        expect(f.inyecciones).toStrictEqual([]);
      }
    }
  });
});

describe("FX-14 Hipótesis declaradas (variantes cd-*)", { timeout: 60_000 }, () => {
  it("FX-14 Hipótesis de la MRZ en las variantes de dígitos de control", () => {
    for (const variante of ["cd-documento-alterado", "cd-nacimiento-alterado", "cd-vencimiento-alterado", "cd-compuesto-alterado", "cd-documento-relleno"] as const) {
      expect(generarMrzTd1(PERSONA_BASE, { variante }).hipotesis).toStrictEqual(["G05", "M01", "M02", "M03"]);
    }
  });
});

/** Tabla de confusiones OCR-B de FX-20 (literal de la spec). */
const CONFUSIONES: Record<string, readonly string[]> = { "0": ["O", "Q"], "1": ["I"], "2": ["Z"], "5": ["S"], "6": ["G"], "8": ["B"] };
/** Zonas numéricas de FX-20 como intervalos semiabiertos por línea (1 o 2). */
const ZONAS: readonly (readonly [1 | 2, number, number])[] = [
  [1, 5, 20],
  [2, 0, 7],
  [2, 8, 15],
  [2, 18, 28],
  [2, 29, 30],
];
const enZona = (linea: number, posicion: number): boolean => ZONAS.some(([l, a, b]) => l === linea && posicion >= a && posicion < b);

describe("FX-20 Errores OCR-B inyectados", { timeout: 60_000 }, () => {
  it("FX-20 Posición explícita", () => {
    const f = generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 0 }] });
    expect(f.lineas[1]).toBe("B503149F3503144COL9999123456<5");
    expect(f.lineasSinErrores[1]).toBe("8503149F3503144COL9999123456<5");
    expect(f.inyecciones).toStrictEqual([{ linea: 2, posicion: 0, original: "8", inyectado: "B" }]);
  });

  it("FX-20 Posición elegida con la semilla", () => {
    const f = generar(PERSONA_BASE, { variante: "ocr-b", semilla: 1, erroresOcr: 1 });
    expect(f.inyecciones).toStrictEqual([{ linea: 2, posicion: 9, original: "5", inyectado: "S" }]);
    expect(f.lineas[1]).toBe("8503149F3S03144COL9999123456<5");
  });

  it("FX-20 Un error por omisión, con la semilla 1", () => {
    expect(generar(PERSONA_BASE, { variante: "ocr-b" })).toStrictEqual(generar(PERSONA_BASE, { variante: "ocr-b", semilla: 1, erroresOcr: 1 }));
  });

  it("FX-20 Esperado, texto y líneas de la variante ocr-b", () => {
    const f = generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5, semilla: 3 });
    expect(f.esperado).toStrictEqual(generarMrzTd1(PERSONA_BASE).esperado);
    expect(f.lineasSinErrores).toStrictEqual([L1_BASE, L2_BASE, L3_BASE]);
    expect(f.texto).toBe(f.lineas.join(String.fromCharCode(10)));
    expect(f.lineas[2]).toBe(L3_BASE);
    expect(f.inyecciones).toHaveLength(5);
  });

  it("FX-20 Cinco errores: posiciones distintas, en zona numérica y con pares de la tabla", () => {
    for (let semilla = 0; semilla < 200; semilla++) {
      const f = generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5, semilla });
      expect(f.inyecciones).toHaveLength(5);
      const claves = new Set(f.inyecciones.map((i) => `${i.linea}:${i.posicion}`));
      expect(claves.size).toBe(5);
      const lineas = [...f.lineas];
      for (const { linea, posicion, original, inyectado } of f.inyecciones) {
        expect(enZona(linea, posicion)).toBe(true);
        expect(CONFUSIONES[original]).toContain(inyectado);
        expect(f.lineasSinErrores[linea - 1]?.[posicion]).toBe(original);
        expect(lineas[linea - 1]?.[posicion]).toBe(inyectado);
        const actual = lineas[linea - 1] ?? "";
        lineas[linea - 1] = actual.slice(0, posicion) + original + actual.slice(posicion + 1);
      }
      expect(lineas).toStrictEqual([...f.lineasSinErrores]);
    }
  });

  it("FX-20 El cero se confunde con O o con Q según la semilla", () => {
    const vistos = new Set<string>();
    for (let semilla = 0; semilla < 300; semilla++) {
      for (const i of generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5, semilla }).inyecciones) {
        if (i.original === "0") vistos.add(i.inyectado);
      }
    }
    expect([...vistos].sort()).toStrictEqual(["O", "Q"]);
  });

  it("FX-20 Todas las posiciones elegibles se alcanzan con alguna semilla", () => {
    const alcanzadas = new Set<string>();
    for (let semilla = 0; semilla < 400; semilla++) {
      for (const i of generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5, semilla }).inyecciones) alcanzadas.add(`${i.linea}:${i.posicion}`);
    }
    const elegibles: string[] = [];
    for (const [linea, a, b] of ZONAS) {
      const texto = [L1_BASE, L2_BASE][linea - 1] ?? "";
      for (let p = a; p < b; p++) if (CONFUSIONES[texto[p] ?? ""] !== undefined) elegibles.push(`${linea}:${p}`);
    }
    expect(elegibles).toHaveLength(21);
    expect([...alcanzadas].sort()).toStrictEqual(elegibles.sort());
  });

  it("FX-20 Posiciones explícitas en orden de aplicación y en la línea 1", () => {
    const f = generar(PERSONA_BASE, {
      variante: "ocr-b",
      posicionesOcr: [
        { linea: 2, posicion: 29 },
        { linea: 1, posicion: 9 },
        { linea: 1, posicion: 17, caracter: "O" },
        { linea: 1, posicion: 16 },
      ],
    });
    expect(f.inyecciones).toStrictEqual([
      { linea: 2, posicion: 29, original: "5", inyectado: "S" },
      { linea: 1, posicion: 9, original: "1", inyectado: "I" },
      { linea: 1, posicion: 17, original: "0", inyectado: "O" },
      { linea: 1, posicion: 16, original: "6", inyectado: "G" },
    ]);
    expect(f.lineas[0]).toBe("ICCOL9999I234551GO01<<<<<<<<<<");
    expect(f.lineas[1]).toBe("8503149F3503144COL9999123456<S");
  });

  it("FX-20 Los errores no dependen de la semilla con posiciones explícitas", () => {
    const o = { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 2 }] };
    expect(generar(PERSONA_BASE, { ...o, semilla: 1 }).lineas).toStrictEqual(generar(PERSONA_BASE, { ...o, semilla: 2 }).lineas);
    expect(generar(PERSONA_BASE, o).lineas[1]).toBe("85O3149F3503144COL9999123456<5");
  });
});

describe("FX-21 Opciones de inyección OCR-B", { timeout: 60_000 }, () => {
  it("FX-21 Posiciones no admitidas", () => {
    for (const p of [{ linea: 2, posicion: 7 }, { linea: 2, posicion: 18 }, { linea: 3, posicion: 0 }, { linea: 2, posicion: 0, caracter: "S" }]) {
      esperarError(() => generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [p] }), "opcion-ocr-invalida", "posicionesOcr");
    }
  });

  it("FX-21 Posición repetida", () => {
    esperarError(
      () => generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 0 }, { linea: 2, posicion: 0 }] }),
      "opcion-ocr-invalida",
      "posicionesOcr",
    );
  });

  it("FX-21 Combinaciones y rangos no admitidos", () => {
    for (const o of [
      { variante: "valida", erroresOcr: 2 },
      { variante: "ocr-b", erroresOcr: 0 },
      { variante: "ocr-b", erroresOcr: 6 },
      { variante: "ocr-b", erroresOcr: 1, posicionesOcr: [{ linea: 2, posicion: 0 }] },
    ]) {
      esperarError(() => generar(PERSONA_BASE, o), "opcion-ocr-invalida");
    }
  });

  it("FX-21 Cero con carácter explícito", () => {
    const f = generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 2, caracter: "Q" }] });
    expect(f.lineas[1]).toBe("85Q3149F3503144COL9999123456<5");
    expect(f.inyecciones).toStrictEqual([{ linea: 2, posicion: 2, original: "0", inyectado: "Q" }]);
  });

  it("FX-21 Opciones OCR fuera de ocr-b", () => {
    esperarError(() => generar(PERSONA_BASE, { variante: "valida", posicionesOcr: [{ linea: 2, posicion: 0 }] }), "opcion-ocr-invalida", "posicionesOcr");
    esperarError(() => generar(PERSONA_BASE, { variante: "cd-documento-relleno", erroresOcr: 1 }), "opcion-ocr-invalida", "erroresOcr");
    esperarError(() => generar(PERSONA_BASE, { posicionesOcr: [{ linea: 2, posicion: 0 }] }), "opcion-ocr-invalida", "posicionesOcr");
  });

  it("FX-20 Inyecciones literales con semillas 2 y 4 (algoritmo de design.md, decisión 7, calculado fuera del repositorio)", () => {
    const comoTexto = (semilla: number) =>
      generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5, semilla })
        .inyecciones.map((i) => `${i.linea}:${i.posicion}:${i.original}>${i.inyectado}`)
        .join(" ");
    expect(comoTexto(2)).toBe("2:12:1>I 1:17:0>O 2:2:0>Q 2:9:5>S 2:0:8>B");
    expect(comoTexto(4)).toBe("2:27:6>G 1:17:0>O 1:10:2>Z 1:16:6>G 2:2:0>O");
  });

  it("FX-21 erroresOcr no entero o fuera de rango", () => {
    for (const erroresOcr of [1.5, "1", null, -1, Number.NaN]) {
      esperarError(() => generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr }), "opcion-ocr-invalida", "erroresOcr");
    }
  });

  it("FX-21 posicionesOcr con forma o valores no admitidos", () => {
    const listas: unknown[] = [
      [],
      { linea: 2, posicion: 0 },
      [null],
      [[2, 0]],
      [{ linea: 2 }],
      [{ linea: 2, posicion: 0.5 }],
      [{ linea: 2, posicion: -1 }],
      [{ linea: 2, posicion: 30 }],
      [{ linea: 1, posicion: 4 }],
      [{ linea: 1, posicion: 20 }],
      [{ linea: 1, posicion: 5 }],
      [{ linea: 2, posicion: 28 }],
      [{ linea: "2", posicion: 0 }],
      [{ linea: 0, posicion: 0 }],
      [{ linea: 2, posicion: 0, caracter: "b" }],
      [{ linea: 2, posicion: 2, caracter: "B" }],
      [{ linea: 2, posicion: 0, caracter: 8 }],
      [{ linea: 2, posicion: 0, caracter: "8" }],
      [{ linea: 2, posicion: 0 }, { linea: 2, posicion: 7 }],
    ];
    for (const posicionesOcr of listas) {
      esperarError(() => generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr }), "opcion-ocr-invalida", "posicionesOcr");
    }
  });

  it("FX-21 Misma posición en líneas distintas no es repetida", () => {
    const f = generar(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 1, posicion: 9 }, { linea: 2, posicion: 9 }] });
    expect(f.inyecciones.map((i) => i.inyectado)).toStrictEqual(["I", "S"]);
  });

  it("FX-21 Las opciones OCR se validan después de la semilla y antes que las restricciones de la MRZ", () => {
    esperarError(() => generar(PERSONA_BASE, { variante: "ocr-b", semilla: -1, erroresOcr: 9 }), "semilla-invalida");
    esperarError(() => generar(con({ nuip: "99991234" }), { variante: "ocr-b", erroresOcr: 9 }), "opcion-ocr-invalida");
    esperarError(() => generar(con({ nuip: "99991234" }), { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 18 }] }), "opcion-ocr-invalida");
    esperarError(() => generar(con({ nuip: "99991234" }), { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 26 }] }), "opcion-ocr-invalida");
    esperarError(() => generar(con({ nuip: "99991234" }), { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 22 }] }), "nuip-no-soportado-en-mrz");
    // Con NUIP corto la validación usa L2 con el NUIP rellenado con < (design.md, decisión 3): el compuesto de
    // "8503149F3503144COL99991234<<<" es 8 según el oráculo, que sí tiene confusión.
    expect(compuestoTd1(L1_BASE, "8503149F3503144COL99991234<<<0")).toBe("8");
    esperarError(() => generar(con({ nuip: "99991234" }), { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 29 }] }), "nuip-no-soportado-en-mrz");
    esperarError(() => generar(con({ primerApellido: "DE LA OSSA" }), { variante: "ocr-b", erroresOcr: 0 }), "opcion-ocr-invalida");
  });

  it("FX-21 erroresOcr de 1 a 5 aceptados", () => {
    for (let n = 1; n <= 5; n++) expect(generar(PERSONA_BASE, { variante: "ocr-b", erroresOcr: n }).inyecciones).toHaveLength(n);
  });
});

describe("FX-14 Hipótesis declaradas (ocr-b)", { timeout: 60_000 }, () => {
  it("FX-14 Hipótesis de la MRZ en la variante ocr-b", () => {
    expect(generar(PERSONA_BASE, { variante: "ocr-b" }).hipotesis).toStrictEqual(["G05", "M01", "M02", "M03"]);
  });
});
