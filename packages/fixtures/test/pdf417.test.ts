// fixture-sintetico: payloads PDF417 generados de personas ficticias (NUIP y AFIS con prefijo 9999); el marcador PubDSK_1 es estructural.
import { describe, expect, it } from "vitest";
import { ErrorFixture } from "../src/errores.js";
import { generarPdf417 } from "../src/pdf417.js";
import { PERSONA_BASE } from "../src/persona.js";

/** Decodificación ISO-8859-1 independiente del codificador del generador (design.md, decisión 11). */
const LATIN1 = new TextDecoder("latin1");
const texto = (bytes: Uint8Array, a: number, b: number): string => LATIN1.decode(bytes.subarray(a, b));
const nul = (n: number): string => "\0".repeat(n);
const con = (cambios: Record<string, unknown>): Record<string, unknown> => ({ ...PERSONA_BASE, ...cambios });
const generar = (persona: unknown, opciones?: unknown) => generarPdf417(persona as typeof PERSONA_BASE, opciones as undefined);

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

describe("FX-07 Trama PDF417 completa", { timeout: 60_000 }, () => {
  it("FX-07 Trama completa de la persona base", () => {
    const { bytes } = generarPdf417(PERSONA_BASE);
    expect(bytes.length).toBe(531);
    expect(texto(bytes, 10, 24)).toBe(nul(14));
    expect(texto(bytes, 24, 32)).toBe("PubDSK_1");
    expect(texto(bytes, 32, 40)).toBe(nul(8));
    expect(texto(bytes, 48, 58)).toBe("9999123456");
    expect(texto(bytes, 0, 2)).toMatch(/^[0-9]{2}$/);
    expect(texto(bytes, 40, 48)).toMatch(/^[0-9]{8}$/);
  });

  it("FX-07 Rangos declarados de la trama completa", () => {
    expect(generarPdf417(PERSONA_BASE).rangos).toStrictEqual({
      afis: [2, 10],
      marcador: [24, 32],
      nuip: [48, 58],
      primerApellido: [58, 81],
      segundoApellido: [81, 104],
      primerNombre: [104, 127],
      segundoNombre: [127, 150],
      bloqueDemografico: [150, 168],
      rh: [166, 168],
      cola: [168, 531],
    });
  });

  it("FX-07 NUIP corto rellenado con ceros", () => {
    const f = generar(con({ nuip: "99991234" }));
    expect(texto(f.bytes, 48, 58)).toBe("0099991234");
    expect(f.esperado.nuip).toBe("99991234");
  });

  it("FX-07 NUIP de cinco dígitos rellenado con cinco ceros", () => {
    const f = generar(con({ nuip: "99991" }));
    expect(texto(f.bytes, 48, 58)).toBe("0000099991");
    expect(f.esperado.nuip).toBe("99991");
    expect(f.bytes.length).toBe(531);
  });
});

describe("FX-08 Campos de nombre en ISO-8859-1", { timeout: 60_000 }, () => {
  it("FX-08 Nombres de la persona base", () => {
    const { bytes } = generarPdf417(PERSONA_BASE);
    expect(texto(bytes, 58, 81)).toBe("PRUEBA" + nul(17));
    expect(texto(bytes, 81, 104)).toBe("EJEMPLO" + nul(16));
    expect(texto(bytes, 104, 127)).toBe("FICTICIA" + nul(15));
    expect(texto(bytes, 127, 150)).toBe("LUZ" + nul(20));
  });

  it("FX-08 Ñ como byte 0xD1", () => {
    const f = generar(con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }));
    expect([...f.bytes.subarray(58, 62)]).toStrictEqual([0x50, 0x45, 0xd1, 0x41]);
    expect([...f.bytes.subarray(81, 86)]).toStrictEqual([0x4e, 0x55, 0xd1, 0x45, 0x5a]);
    expect(f.esperado.primerApellido).toBe("PEÑA");
  });

  it("FX-08 Apellido compuesto con espacio simple", () => {
    const { bytes } = generar(con({ primerApellido: "DE LA OSSA" }));
    expect(texto(bytes, 58, 81)).toBe("DE LA OSSA" + nul(13));
    expect(texto(bytes, 81, 88)).toBe("EJEMPLO");
    expect([...bytes.subarray(60, 61)]).toStrictEqual([0x20]);
  });

  it("FX-08 Segundo nombre ausente", () => {
    const f = generar(con({ segundoNombre: "" }));
    expect(texto(f.bytes, 127, 150)).toBe(nul(23));
    expect(texto(f.bytes, 150, 151)).toBe("0");
    expect(f.bytes.length).toBe(531);
    expect(f.esperado.segundoNombre).toBe("");
  });

  it("FX-08 Nombre de 23 caracteres ocupa todo el campo", () => {
    const { bytes } = generar(con({ segundoApellido: "ABCDEFGHIJKLMNOPQRSTUVW" }));
    expect(texto(bytes, 81, 104)).toBe("ABCDEFGHIJKLMNOPQRSTUVW");
    expect(texto(bytes, 104, 112)).toBe("FICTICIA");
  });
});

describe("FX-09 Bloque demográfico sexo-primero y RH", { timeout: 60_000 }, () => {
  it("FX-09 Bloque de la persona base", () => {
    const { bytes } = generarPdf417(PERSONA_BASE);
    expect(texto(bytes, 150, 165)).toBe("0F1985031416001");
    expect(texto(bytes, 165, 166)).toMatch(/^[0-9]$/);
    expect(texto(bytes, 166, 168)).toBe("O+");
  });

  it("FX-09 RH AB negativo de tres caracteres", () => {
    const f = generar(con({ rh: "AB-" }));
    expect(texto(f.bytes, 166, 169)).toBe("AB-");
    expect(f.rangos.rh).toStrictEqual([166, 169]);
    expect(f.rangos.cola).toStrictEqual([169, 531]);
    expect(f.rangos.bloqueDemografico).toStrictEqual([150, 169]);
    expect(f.bytes.length).toBe(531);
  });

  it("FX-09 RH AB positivo completo", () => {
    const f = generar(con({ rh: "AB+" }));
    expect(texto(f.bytes, 166, 169)).toBe("AB+");
    expect(f.esperado.rh).toBe("AB+");
  });

  it("FX-09 RH O negativo conserva el signo", () => {
    const f = generar(con({ rh: "O-" }));
    expect(texto(f.bytes, 166, 168)).toBe("O-");
    expect(f.esperado.rh).toBe("O-");
  });

  it("FX-09 Sexo F con M en el apellido", () => {
    const f = generar(con({ primerApellido: "MARTINEZ", sexo: "F" }));
    expect(texto(f.bytes, 151, 152)).toBe("F");
    expect(f.esperado.sexo).toBe("F");
  });

  it("FX-09 Sexo M, otra fecha y otro DIVIPOL", () => {
    const { bytes } = generar(con({ sexo: "M", fechaNacimiento: "2000-12-01", departamento: "88", municipio: "123" }));
    expect(texto(bytes, 150, 165)).toBe("0M2000120188123");
  });
});

describe("FX-13 Cola biométrica aleatoria no realista", { timeout: 60_000 }, () => {
  it("FX-13 Longitud de la cola", () => {
    const base = generarPdf417(PERSONA_BASE);
    const ab = generar(con({ rh: "AB+" }));
    expect(base.rangos.cola[1] - base.rangos.cola[0]).toBe(363);
    expect(ab.rangos.cola[1] - ab.rangos.cola[0]).toBe(362);
    expect(base.bytes.length).toBe(531);
    expect(ab.bytes.length).toBe(531);
  });

  it("FX-13 La cola no depende de la persona", () => {
    const a = generarPdf417(PERSONA_BASE, { semilla: 5 });
    const b = generar(con({ primerApellido: "MUESTRA", nuip: "9999000001" }), { semilla: 5 });
    expect(b.bytes.subarray(48, 58)).not.toStrictEqual(a.bytes.subarray(48, 58));
    expect(b.bytes.subarray(...b.rangos.cola)).toStrictEqual(a.bytes.subarray(...a.rangos.cola));
  });

  it("FX-13 Semillas distintas, colas distintas", () => {
    const a = generarPdf417(PERSONA_BASE, { semilla: 1 });
    const b = generarPdf417(PERSONA_BASE, { semilla: 2 });
    expect(b.bytes.subarray(...b.rangos.cola)).not.toStrictEqual(a.bytes.subarray(...a.rangos.cola));
  });

  it("FX-13 La cola usa todo el rango de bytes", () => {
    const { bytes, rangos } = generarPdf417(PERSONA_BASE);
    const cola = [...bytes.subarray(...rangos.cola)];
    expect(Math.max(...cola)).toBeGreaterThan(0xf0);
    expect(Math.min(...cola)).toBeLessThan(0x10);
  });
});

describe("FX-15 Estructura declarada del PDF417", { timeout: 60_000 }, () => {
  it("FX-15 Esperado de la persona base", () => {
    expect(generarPdf417(PERSONA_BASE).esperado).toStrictEqual({
      nuip: "9999123456",
      primerApellido: "PRUEBA",
      segundoApellido: "EJEMPLO",
      primerNombre: "FICTICIA",
      segundoNombre: "LUZ",
      sexo: "F",
      fechaNacimiento: "1985-03-14",
      departamento: "16",
      municipio: "001",
      rh: "O+",
    });
  });

  it("FX-15 Metadatos del fixture", () => {
    const f = generarPdf417(PERSONA_BASE, { semilla: 9 });
    expect(f.sintetico).toBe(true);
    expect(f.variante).toBe("completa");
    expect(f.semilla).toBe(9);
    expect(f.persona).toStrictEqual(PERSONA_BASE);
    expect(Object.keys(f).sort()).toStrictEqual(["bytes", "esperado", "hipotesis", "persona", "rangos", "semilla", "sintetico", "variante"]);
    expect(f.bytes).toBeInstanceOf(Uint8Array);
  });
});

describe("FX-14 Hipótesis declaradas", { timeout: 60_000 }, () => {
  it("FX-14 Hipótesis de la trama completa", () => {
    expect(generarPdf417(PERSONA_BASE).hipotesis).toStrictEqual(["G01", "H01", "H02", "H03", "H04", "H05", "H06", "H09", "H11"]);
  });
});

describe("FX-06 Determinismo con semilla", { timeout: 60_000 }, () => {
  it("FX-06 Misma semilla, mismos bytes", () => {
    const a = generarPdf417(PERSONA_BASE, { semilla: 7 });
    const b = generarPdf417(PERSONA_BASE, { semilla: 7 });
    expect([...a.bytes]).toStrictEqual([...b.bytes]);
    expect(a).toStrictEqual(b);
  });

  it("FX-06 Semilla por omisión", () => {
    expect(generarPdf417(PERSONA_BASE)).toStrictEqual(generarPdf417(PERSONA_BASE, { semilla: 1 }));
    expect(generarPdf417(PERSONA_BASE, {})).toStrictEqual(generarPdf417(PERSONA_BASE, { semilla: 1 }));
    expect(generarPdf417(PERSONA_BASE).semilla).toBe(1);
  });

  it("FX-06 Valores literales con semilla 1", () => {
    const { bytes } = generarPdf417(PERSONA_BASE, { semilla: 1 });
    expect(texto(bytes, 0, 2)).toBe("60");
    expect(texto(bytes, 2, 10)).toBe("99995992");
    expect(texto(bytes, 40, 48)).toBe("67494414");
    expect(texto(bytes, 165, 166)).toBe("2");
    expect([...bytes.subarray(168, 172)]).toStrictEqual([0x27, 0x7d, 0x11, 0x65]);
  });

  it("FX-06 Valores literales con semilla 2", () => {
    const { bytes } = generarPdf417(PERSONA_BASE, { semilla: 2 });
    expect(texto(bytes, 0, 2)).toBe("73");
    expect(texto(bytes, 2, 10)).toBe("99992586");
    expect(texto(bytes, 40, 48)).toBe("43717248");
    expect(texto(bytes, 165, 166)).toBe("5");
    expect([...bytes.subarray(168, 172)]).toStrictEqual([0x24, 0xac, 0x5d, 0xf8]);
  });

  it("FX-06 Copias independientes", () => {
    const a = generarPdf417(PERSONA_BASE, { semilla: 3 });
    a.bytes[48] = 0xff;
    expect(generarPdf417(PERSONA_BASE, { semilla: 3 }).bytes[48]).toBe(0x39);
  });
});

describe("FX-02 Interfaz pública estable (fixture PDF417)", { timeout: 60_000 }, () => {
  it("FX-02 Fixture inmutable", () => {
    const f = generarPdf417(PERSONA_BASE);
    expect(() => {
      (f.esperado as { nuip: string }).nuip = "9999000000";
    }).toThrow(TypeError);
    expect(() => {
      (f.hipotesis as string[]).push("H10");
    }).toThrow(TypeError);
  });

  it("FX-02 Todo el fixture salvo bytes está congelado", () => {
    const f = generarPdf417(PERSONA_BASE);
    for (const valor of [f, f.persona, f.esperado, f.hipotesis, f.rangos, f.rangos.nuip, f.rangos.cola, f.rangos.marcador]) {
      expect(Object.isFrozen(valor)).toBe(true);
    }
    expect(Object.isFrozen(f.bytes)).toBe(false);
  });
});

describe("FX-03 Validación de la persona y de las opciones (generarPdf417)", { timeout: 60_000 }, () => {
  it("FX-03 Persona base válida", () => {
    expect(generarPdf417(PERSONA_BASE).sintetico).toBe(true);
  });

  it("FX-03 Clave sobrante, faltante o persona que no es objeto", () => {
    const sinRh: Record<string, unknown> = { ...PERSONA_BASE };
    delete sinRh.rh;
    esperarError(() => generar(con({ apodo: "X" })), "persona-invalida", null);
    esperarError(() => generar(sinRh), "persona-invalida", null);
    esperarError(() => generar(null), "persona-invalida", null);
  });

  it("FX-03 Primer error en el orden fijado", () => {
    esperarError(() => generar(con({ nuip: "123", rh: "Z" }), { variante: "otra" }), "nuip-fuera-de-rango-sintetico", "nuip");
  });

  it("FX-03 La persona se valida antes que las opciones, y la variante antes que la semilla", () => {
    esperarError(() => generar(con({ rh: "Z" }), { variante: "otra", semilla: -1 }), "rh-invalido", "rh");
    esperarError(() => generar(PERSONA_BASE, { variante: "otra", semilla: -1 }), "variante-invalida", "variante");
  });

  it("FX-03 Opciones inválidas", () => {
    esperarError(() => generar(PERSONA_BASE, { variante: "otra" }), "variante-invalida", "variante");
    esperarError(() => generar(PERSONA_BASE, { semilla: -1 }), "semilla-invalida", "semilla");
    esperarError(() => generar(PERSONA_BASE, { semilla: 1.5 }), "semilla-invalida", "semilla");
  });

  it("FX-03 Opciones que no son un objeto", () => {
    for (const opciones of [null, 1, "completa", true, ["completa"]]) {
      esperarError(() => generar(PERSONA_BASE, opciones), "variante-invalida", "opciones");
    }
  });

  it("FX-03 Variantes y semillas válidas aceptadas", () => {
    for (const variante of ["completa", "windows-truncada", "sin-pubdsk", "fecha-primero"]) {
      expect(generar(PERSONA_BASE, { variante }).variante).toBe(variante);
    }
    expect(generarPdf417(PERSONA_BASE, { semilla: 0 }).semilla).toBe(0);
    expect(generarPdf417(PERSONA_BASE, { semilla: 4294967295 }).semilla).toBe(4294967295);
    expect(generar(PERSONA_BASE, { variante: undefined, semilla: undefined }).variante).toBe("completa");
  });
});

describe("FX-04 Reglas de los campos de la persona (generarPdf417)", { timeout: 60_000 }, () => {
  it("FX-04 Un valor inválido por campo", () => {
    const tabla: [string, string, string][] = [
      ["nuip", "9999", "nuip-fuera-de-rango-sintetico"],
      ["serialDocumento", "99991234", "serial-fuera-de-rango-sintetico"],
      ["primerApellido", "Prueba", "nombre-invalido"],
      ["segundoApellido", "ABCDEFGHIJKLMNOPQRSTUVWX", "nombre-demasiado-largo"],
      ["primerNombre", "FICTICÍA", "nombre-invalido"],
      ["segundoNombre", " LUZ", "nombre-invalido"],
      ["sexo", "X", "sexo-invalido"],
      ["fechaNacimiento", "1985-02-29", "fecha-invalida"],
      ["fechaVencimiento", "2100-01-01", "fecha-invalida"],
      ["departamento", "6", "divipol-invalido"],
      ["municipio", "01", "divipol-invalido"],
      ["lugarExpedicion", "1600A", "divipol-invalido"],
      ["rh", "AB", "rh-invalido"],
    ];
    for (const [campo, valor, codigo] of tabla) esperarError(() => generar(con({ [campo]: valor })), codigo, campo);
  });

  it("FX-04 Doble espacio en apellido compuesto", () => {
    esperarError(() => generar(con({ primerApellido: "DE  LA OSSA" })), "nombre-invalido", "primerApellido");
  });

  it("FX-04 Valores límite aceptados", () => {
    for (const cambios of [{ nuip: "99991" }, { segundoApellido: "ABCDEFGHIJKLMNOPQRSTUVW" }, { fechaNacimiento: "2000-02-29" }, { segundoNombre: "" }]) {
      expect(generar(con(cambios)).sintetico).toBe(true);
    }
  });
});

describe("FX-05 Nunca un número fuera del rango sintético (generarPdf417)", { timeout: 60_000 }, () => {
  it("FX-05 NUIP con forma de cédula real rechazado", () => {
    esperarError(() => generar(con({ nuip: "1234567890" })), "nuip-fuera-de-rango-sintetico", "nuip");
  });

  it("FX-05 AFIS con prefijo sintético", () => {
    for (let semilla = 0; semilla < 50; semilla++) {
      const { bytes, rangos } = generarPdf417(PERSONA_BASE, { semilla });
      expect(texto(bytes, ...rangos.afis)).toMatch(/^9999[0-9]{4}$/);
    }
  });
});

/** Concatena trozos de bytes y textos ISO-8859-1 (oráculo de las relaciones de FX-10 y FX-11). */
function concatenar(...partes: (Uint8Array | string)[]): number[] {
  return partes.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : [...p]));
}

describe("FX-10 Variante Windows truncada", { timeout: 60_000 }, () => {
  it("FX-10 Relación exacta con la trama completa", () => {
    const c = generarPdf417(PERSONA_BASE);
    const w = generarPdf417(PERSONA_BASE, { variante: "windows-truncada" });
    expect([...w.bytes]).toStrictEqual(concatenar(c.bytes.subarray(0, 13), c.bytes.subarray(24, 531)));
    expect(w.bytes.length).toBe(520);
    expect(texto(w.bytes, 13, 21)).toBe("PubDSK_1");
    expect(w.esperado).toStrictEqual(c.esperado);
    expect(w.variante).toBe("windows-truncada");
  });

  it("FX-10 Rangos desplazados", () => {
    const { rangos } = generarPdf417(PERSONA_BASE, { variante: "windows-truncada" });
    expect(rangos.marcador).toStrictEqual([13, 21]);
    expect(rangos.nuip).toStrictEqual([37, 47]);
    expect(rangos.primerApellido).toStrictEqual([47, 70]);
    expect(rangos.bloqueDemografico).toStrictEqual([139, 157]);
    expect(rangos.cola).toStrictEqual([157, 520]);
  });

  it("FX-10 Rangos completos de la trama truncada", () => {
    expect(generarPdf417(PERSONA_BASE, { variante: "windows-truncada" }).rangos).toStrictEqual({
      afis: [2, 10],
      marcador: [13, 21],
      nuip: [37, 47],
      primerApellido: [47, 70],
      segundoApellido: [70, 93],
      primerNombre: [93, 116],
      segundoNombre: [116, 139],
      bloqueDemografico: [139, 157],
      rh: [155, 157],
      cola: [157, 520],
    });
  });

  it("FX-10 Relación con RH de tres caracteres y otra semilla", () => {
    const persona = con({ rh: "AB-" });
    const c = generar(persona, { semilla: 11 });
    const w = generar(persona, { variante: "windows-truncada", semilla: 11 });
    expect([...w.bytes]).toStrictEqual(concatenar(c.bytes.subarray(0, 13), c.bytes.subarray(24)));
    expect(w.rangos.rh).toStrictEqual([155, 158]);
  });
});

describe("FX-11 Variante sin PubDSK", { timeout: 60_000 }, () => {
  it("FX-11 Relación exacta con la trama completa", () => {
    const c = generarPdf417(PERSONA_BASE);
    const s = generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" });
    expect([...s.bytes]).toStrictEqual(concatenar(c.bytes.subarray(0, 24), nul(9), c.bytes.subarray(32, 530)));
    expect(s.bytes.length).toBe(531);
    expect(LATIN1.decode(s.bytes)).not.toContain("PubDSK");
    expect(s.esperado).toStrictEqual(c.esperado);
    expect(s.variante).toBe("sin-pubdsk");
  });

  it("FX-11 Rangos desplazados una posición", () => {
    const { rangos } = generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" });
    expect(rangos.marcador).toBeNull();
    expect(rangos.afis).toStrictEqual([2, 10]);
    expect(rangos.nuip).toStrictEqual([49, 59]);
    expect(rangos.primerApellido).toStrictEqual([59, 82]);
    expect(rangos.bloqueDemografico).toStrictEqual([151, 169]);
    expect(rangos.cola).toStrictEqual([169, 531]);
  });

  it("FX-11 Rangos completos de la variante sin marcador", () => {
    expect(generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" }).rangos).toStrictEqual({
      afis: [2, 10],
      marcador: null,
      nuip: [49, 59],
      primerApellido: [59, 82],
      segundoApellido: [82, 105],
      primerNombre: [105, 128],
      segundoNombre: [128, 151],
      bloqueDemografico: [151, 169],
      rh: [167, 169],
      cola: [169, 531],
    });
  });

  it("FX-11 Bytes del bloque desplazado", () => {
    const { bytes } = generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" });
    expect(texto(bytes, 10, 41)).toBe(nul(31));
    expect(texto(bytes, 49, 59)).toBe("9999123456");
    expect(texto(bytes, 151, 166)).toBe("0F1985031416001");
    expect(texto(bytes, 167, 169)).toBe("O+");
  });
});

describe("FX-12 Variante fecha-primero", { timeout: 60_000 }, () => {
  it("FX-12 Bloque fecha-primero de la persona base", () => {
    const f = generarPdf417(PERSONA_BASE, { variante: "fecha-primero" });
    expect(texto(f.bytes, 150, 166)).toBe("0219850314F16001");
    expect(texto(f.bytes, 166, 167)).toMatch(/^[0-9]$/);
    expect(texto(f.bytes, 167, 169)).toBe("O+");
    expect(f.rangos.bloqueDemografico).toStrictEqual([150, 169]);
    expect(f.rangos.rh).toStrictEqual([167, 169]);
    expect(f.rangos.cola).toStrictEqual([169, 531]);
    expect(f.bytes.length).toBe(531);
  });

  it("FX-12 Cabecera y nombres iguales a la trama completa", () => {
    const c = generarPdf417(PERSONA_BASE);
    const f = generarPdf417(PERSONA_BASE, { variante: "fecha-primero" });
    expect([...f.bytes.subarray(0, 150)]).toStrictEqual([...c.bytes.subarray(0, 150)]);
    expect(f.rangos.marcador).toStrictEqual([24, 32]);
    expect(f.rangos.nuip).toStrictEqual([48, 58]);
  });

  it("FX-12 Mismos datos esperados que la trama completa", () => {
    const persona = con({ rh: "AB-" });
    const f = generar(persona, { variante: "fecha-primero" });
    expect(f.esperado).toStrictEqual(generar(persona).esperado);
    expect(f.esperado.rh).toBe("AB-");
    expect(texto(f.bytes, 167, 170)).toBe("AB-");
    expect(f.rangos.cola).toStrictEqual([170, 531]);
  });
});

describe("FX-14 Hipótesis declaradas (variantes)", { timeout: 60_000 }, () => {
  it("FX-14 Hipótesis de la trama Windows truncada", () => {
    expect(generarPdf417(PERSONA_BASE, { variante: "windows-truncada" }).hipotesis).toStrictEqual([
      "G01", "G02", "H01", "H02", "H03", "H04", "H05", "H06", "H09", "H11",
    ]);
  });

  it("FX-14 Hipótesis de la variante sin PubDSK", () => {
    expect(generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" }).hipotesis).toStrictEqual([
      "G01", "G03", "H01", "H03", "H04", "H05", "H06", "H07", "H09", "H11",
    ]);
  });

  it("FX-14 Hipótesis de la variante fecha-primero", () => {
    expect(generarPdf417(PERSONA_BASE, { variante: "fecha-primero" }).hipotesis).toStrictEqual([
      "G01", "G04", "H01", "H02", "H03", "H04", "H06", "H08", "H09",
    ]);
  });
});
