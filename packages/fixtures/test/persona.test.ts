// Datos sintéticos: NUIP y serial con prefijo 9999, nombres de la lista de marcadores de ficción.
import { describe, expect, it } from "vitest";
import { ErrorFixture } from "../src/errores.js";
import { PERSONA_BASE, validarPersona } from "../src/persona.js";

/** Ejecuta `fn`, exige que lance `ErrorFixture` y lo devuelve. */
function capturar(fn: () => unknown): ErrorFixture {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorFixture);
    return e as ErrorFixture;
  }
  throw new Error("se esperaba ErrorFixture y no lanzó nada");
}

const con = (cambios: Record<string, unknown>): Record<string, unknown> => ({ ...PERSONA_BASE, ...cambios });

function esperarError(valor: unknown, codigo: string, campo: string | null): void {
  const e = capturar(() => validarPersona(valor));
  expect({ codigo: e.codigo, campo: e.campo }).toStrictEqual({ codigo, campo });
}

const ORDEN = [
  "nuip",
  "serialDocumento",
  "primerApellido",
  "segundoApellido",
  "primerNombre",
  "segundoNombre",
  "sexo",
  "fechaNacimiento",
  "fechaVencimiento",
  "departamento",
  "municipio",
  "lugarExpedicion",
  "rh",
] as const;

/** Tabla literal de FX-04 "Un valor inválido por campo". */
const INVALIDOS: Record<(typeof ORDEN)[number], readonly [unknown, string]> = {
  nuip: ["9999", "nuip-fuera-de-rango-sintetico"],
  serialDocumento: ["99991234", "serial-fuera-de-rango-sintetico"],
  primerApellido: ["Prueba", "nombre-invalido"],
  segundoApellido: ["ABCDEFGHIJKLMNOPQRSTUVWX", "nombre-demasiado-largo"],
  primerNombre: ["FICTICÍA", "nombre-invalido"],
  segundoNombre: [" LUZ", "nombre-invalido"],
  sexo: ["X", "sexo-invalido"],
  fechaNacimiento: ["1985-02-29", "fecha-invalida"],
  fechaVencimiento: ["2100-01-01", "fecha-invalida"],
  departamento: ["6", "divipol-invalido"],
  municipio: ["01", "divipol-invalido"],
  lugarExpedicion: ["1600A", "divipol-invalido"],
  rh: ["AB", "rh-invalido"],
};

describe("FX-02 Interfaz pública estable (persona)", () => {
  it("FX-02 PERSONA_BASE es la persona ficticia de la spec", () => {
    expect(PERSONA_BASE).toStrictEqual({
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
      serialDocumento: "999912345",
      fechaVencimiento: "2035-03-14",
      lugarExpedicion: "16001",
    });
  });

  it("FX-02 Persona base inmutable", () => {
    expect(() => {
      (PERSONA_BASE as { nuip: string }).nuip = "9999000000";
    }).toThrow(TypeError);
    expect(PERSONA_BASE.nuip).toBe("9999123456");
  });
});

describe("FX-03 Validación de la persona", () => {
  it("FX-03 Persona base válida", () => {
    const p = validarPersona(PERSONA_BASE);
    expect(p).toStrictEqual(PERSONA_BASE);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("FX-03 ErrorFixture es un Error con nombre, código y campo", () => {
    const e = capturar(() => validarPersona(con({ sexo: "X" })));
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ErrorFixture");
    expect(e.codigo).toBe("sexo-invalido");
    expect(e.campo).toBe("sexo");
    expect(e.message).toBe("sexo-invalido (sexo)");
    expect(capturar(() => validarPersona(null)).message).toBe("persona-invalida");
  });

  it("FX-03 Clave sobrante, faltante o persona que no es objeto", () => {
    const sinRh: Record<string, unknown> = { ...PERSONA_BASE };
    delete sinRh.rh;
    esperarError(con({ apodo: "X" }), "persona-invalida", null);
    esperarError(sinRh, "persona-invalida", null);
    esperarError(null, "persona-invalida", null);
  });

  it("FX-03 Otros valores que no son una persona", () => {
    const sinRhConApodo: Record<string, unknown> = { ...PERSONA_BASE, apodo: "X" };
    delete sinRhConApodo.rh;
    for (const valor of [undefined, 1, "9999123456", true, [], [PERSONA_BASE], () => PERSONA_BASE, sinRhConApodo, {}]) {
      esperarError(valor, "persona-invalida", null);
    }
  });

  it("FX-03 Primer error en el orden fijado", () => {
    esperarError(con({ nuip: "123", rh: "Z" }), "nuip-fuera-de-rango-sintetico", "nuip");
  });

  it("FX-03 Orden de validación: con todos los campos desde uno en adelante inválidos, gana el primero", () => {
    ORDEN.forEach((campo, i) => {
      const cambios: Record<string, unknown> = {};
      for (const otro of ORDEN.slice(i)) cambios[otro] = INVALIDOS[otro][0];
      esperarError(con(cambios), INVALIDOS[campo][1], campo);
    });
  });
});

describe("FX-04 Reglas de los campos de la persona", () => {
  it("FX-04 Un valor inválido por campo", () => {
    for (const campo of ORDEN) {
      const [valor, codigo] = INVALIDOS[campo];
      esperarError(con({ [campo]: valor }), codigo, campo);
    }
  });

  it("FX-04 Doble espacio en apellido compuesto", () => {
    esperarError(con({ primerApellido: "DE  LA OSSA" }), "nombre-invalido", "primerApellido");
  });

  it("FX-04 Valores límite aceptados", () => {
    for (const cambios of [
      { nuip: "99991" },
      { segundoApellido: "ABCDEFGHIJKLMNOPQRSTUVW" },
      { fechaNacimiento: "2000-02-29" },
      { segundoNombre: "" },
    ]) {
      expect(validarPersona(con(cambios))).toStrictEqual(con(cambios));
    }
  });

  it("FX-04 Un valor que no es texto se rechaza con el código del campo", () => {
    for (const campo of ORDEN) {
      for (const valor of [9999123456, null, undefined, ["F"], { valor: "F" }]) {
        esperarError(con({ [campo]: valor }), INVALIDOS[campo][1] === "nombre-demasiado-largo" ? "nombre-invalido" : INVALIDOS[campo][1], campo);
      }
    }
  });

  it("FX-04 NUIP: de 5 a 10 dígitos con prefijo 9999", () => {
    for (const nuip of ["99990", "999912", "9999123", "99991234", "999912345", "9999123456", "9999000000"]) {
      expect(validarPersona(con({ nuip })).nuip).toBe(nuip);
    }
    for (const nuip of ["", "9999", "99991234567", "1234567890", "0999912345", "8999123456", "9999 12345", "9999-12345", "999912345a", "a9999123456", "9999123456\n", "99991234567890"]) {
      esperarError(con({ nuip }), "nuip-fuera-de-rango-sintetico", "nuip");
    }
  });

  it("FX-04 Serial: exactamente 9 dígitos con prefijo 9999", () => {
    expect(validarPersona(con({ serialDocumento: "999900000" })).serialDocumento).toBe("999900000");
    for (const serialDocumento of ["", "99991234", "9999123456", "123456789", "899912345", "9999123a5", "x999912345", "999912345x"]) {
      esperarError(con({ serialDocumento }), "serial-fuera-de-rango-sintetico", "serialDocumento");
    }
  });

  it("FX-04 Nombres: mayúsculas, Ñ, espacios simples internos y hasta 23 caracteres", () => {
    const campos = ["primerApellido", "segundoApellido", "primerNombre", "segundoNombre"] as const;
    for (const campo of campos) {
      for (const valor of ["A", "PEÑA", "DE LA OSSA", "DEL CARMEN", "ABCDEFGHIJKLMNOPQRSTUVW", "Ñ", "ÑAÑEZ A B"]) {
        expect(validarPersona(con({ [campo]: valor }))[campo]).toBe(valor);
      }
      for (const valor of ["Prueba", "PRUEBA ", " PRUEBA", "DE  LA", "PRUEBA1", "PÉREZ", "O'NEIL", "PRUEBA-EJEMPLO", "PRUEBA\tA", "PRUEBA\n", "ñ"]) {
        esperarError(con({ [campo]: valor }), "nombre-invalido", campo);
      }
      for (const valor of ["ABCDEFGHIJKLMNOPQRSTUVWX", "ABCDEFGHIJ KLMNOPQRSTUVW"]) {
        esperarError(con({ [campo]: valor }), "nombre-demasiado-largo", campo);
      }
    }
    for (const campo of ["primerApellido", "segundoApellido", "primerNombre"] as const) {
      esperarError(con({ [campo]: "" }), "nombre-invalido", campo);
    }
    expect(validarPersona(con({ segundoNombre: "" })).segundoNombre).toBe("");
  });

  it("FX-04 Sexo M o F", () => {
    expect(validarPersona(con({ sexo: "M" })).sexo).toBe("M");
    expect(validarPersona(con({ sexo: "F" })).sexo).toBe("F");
    for (const sexo of ["", "m", "f", "X", "MF", "FEMENINO"]) esperarError(con({ sexo }), "sexo-invalido", "sexo");
  });

  it("FX-04 Fechas gregorianas de 1900 a 2099", () => {
    const validas = ["1900-01-01", "2099-12-31", "2000-02-29", "2024-02-29", "2023-02-28", "1985-03-14"];
    const invalidas = [
      "1899-12-31",
      "2100-01-01",
      "1900-02-29",
      "2023-02-29",
      "2023-00-10",
      "2023-13-01",
      "2023-01-00",
      "1985-3-14",
      "1985-03-1",
      "85-03-14",
      "1985/03/14",
      "1985-03-14 ",
      " 1985-03-14",
      "19850314",
      "1985-03-14T00",
      "abcd-ef-gh",
      "",
    ];
    for (const campo of ["fechaNacimiento", "fechaVencimiento"] as const) {
      for (const fecha of validas) expect(validarPersona(con({ [campo]: fecha }))[campo]).toBe(fecha);
      for (const fecha of invalidas) esperarError(con({ [campo]: fecha }), "fecha-invalida", campo);
      esperarError(con({ [campo]: ["1985-03-14"] }), "fecha-invalida", campo);
    }
  });

  it("FX-04 Último día de cada mes en un año no bisiesto", () => {
    const ultimos = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    ultimos.forEach((ultimo, i) => {
      const mes = String(i + 1).padStart(2, "0");
      expect(validarPersona(con({ fechaNacimiento: `2023-${mes}-${ultimo}` })).fechaNacimiento).toBe(`2023-${mes}-${ultimo}`);
      esperarError(con({ fechaNacimiento: `2023-${mes}-${ultimo + 1}` }), "fecha-invalida", "fechaNacimiento");
    });
  });

  it("FX-04 DIVIPOL: 2, 3 y 5 dígitos", () => {
    expect(validarPersona(con({ departamento: "00", municipio: "000", lugarExpedicion: "00000" }))).toBeTruthy();
    for (const departamento of ["", "6", "016", "1A", " 16", "16 "]) esperarError(con({ departamento }), "divipol-invalido", "departamento");
    for (const municipio of ["", "01", "0001", "00A", " 001", "001 "]) esperarError(con({ municipio }), "divipol-invalido", "municipio");
    for (const lugarExpedicion of ["", "1600", "160011", "1600A", " 16001", "16001 "]) {
      esperarError(con({ lugarExpedicion }), "divipol-invalido", "lugarExpedicion");
    }
  });

  it("FX-04 RH: los ocho grupos con signo", () => {
    for (const rh of ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]) expect(validarPersona(con({ rh })).rh).toBe(rh);
    for (const rh of ["", "AB", "O", "ab+", "0+", "O +", "AB+ ", "C+", "A+-"]) esperarError(con({ rh }), "rh-invalido", "rh");
  });
});

describe("FX-05 Nunca un número fuera del rango sintético (rechazos)", () => {
  it("FX-05 NUIP con forma de cédula real rechazado", () => {
    esperarError(con({ nuip: "1234567890" }), "nuip-fuera-de-rango-sintetico", "nuip");
  });

  it("FX-05 Cero inicial y once dígitos rechazados", () => {
    esperarError(con({ nuip: "0999912345" }), "nuip-fuera-de-rango-sintetico", "nuip");
    esperarError(con({ nuip: "99991234567" }), "nuip-fuera-de-rango-sintetico", "nuip");
  });

  it("FX-05 Serial fuera de rango", () => {
    esperarError(con({ serialDocumento: "123456789" }), "serial-fuera-de-rango-sintetico", "serialDocumento");
  });
});
