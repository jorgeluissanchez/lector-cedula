// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import { leerOffsets } from "../src/pdf417-amarilla/offsets.js";
import { C, C_F, P1, P2, P3, P4, P5, P6, P7, P8, W, insertar, latin1, nulos, sustituir } from "./ayudas/tramas-referencia.js";

const N = String.fromCharCode(0xd1);
const CARACTERES_INVALIDOS = { ok: false, error: "caracteres-invalidos-en-nombre" };

const CAMPOS_P1 = {
  numeroDocumento: "9999123456",
  primerApellido: "PEREZ",
  segundoApellido: "GOMEZ",
  primerNombre: "JUAN",
  segundoNombre: "CARLOS",
  sexo: "M",
  fechaNacimiento: "2000-02-29",
  rh: "O+",
  codigoDepartamentoNacimiento: "16",
  codigoMunicipioNacimiento: "001",
};

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

/** C(P1) con todo el relleno de los cuatro campos de nombre en 0x20. */
function rellenoConEspacios(): Uint8Array {
  const c = C(P1);
  for (let i = 58; i < 150; i++) if (c[i] === 0) c[i] = 0x20;
  return c;
}

describe("PA-07 Lector por offsets (offsets.ts)", () => {
  it("PA-07 Lee C(P1) por posiciones fijas (atrapa: rangos de H04 desplazados)", () => {
    expect(leerOffsets(C(P1))).toStrictEqual({
      campos: CAMPOS_P1,
      bloque: "sexo-primero",
      tipoNuip: "nuip",
      nombresPorH15: false,
      divipol: "ok",
    });
  });

  it("PA-07 Campos de 23 bytes sin relleno y campos vacíos (atrapa: exigir un NUL tras cada nombre)", () => {
    const p8 = leerOffsets(C(P8));
    expect([p8?.campos.segundoApellido, p8?.campos.primerNombre, p8?.campos.segundoNombre]).toStrictEqual([
      "ABCDEFGHIJKLMNOPQRSTUVW",
      "JUAN",
      "CARLOS",
    ]);
    const p7 = leerOffsets(C(P7));
    expect([p7?.campos.segundoApellido, p7?.campos.primerNombre, p7?.campos.segundoNombre]).toStrictEqual([null, "JOHN", "PAUL"]);
    expect(leerOffsets(C(P3))?.campos.segundoNombre).toBeNull();
    expect(leerOffsets(C(P6))?.tipoNuip).toBe("cedula-antigua");
  });

  it("PA-07 Nombres con Ñ, tildes y espacio simple (atrapa: decodificar como windows-1252 o UTF-8)", () => {
    const p2 = leerOffsets(C(P2));
    expect([p2?.campos.primerApellido, p2?.campos.segundoApellido]).toStrictEqual(["PE" + N + "A", "NU" + N + "EZ"]);
    expect(leerOffsets(C(P4))?.campos.primerApellido).toBe("DE LA OSSA");
    expect(leerOffsets(C(P5))?.campos.primerApellido).toBe(N + "USTES");
  });

  it("PA-07 Cualquier fallo de offsets devuelve null (atrapa: entregar una lectura a medias)", () => {
    const casos: [string, Uint8Array][] = [
      ["NUIP con letra", sustituir(C(P1), 56, "O")],
      ["NUIP con separador", sustituir(C(P1), 52, ".")],
      ["NUIP con espacio", sustituir(C(P1), 48, " ")],
      ["NUIP inválido", sustituir(C(P1), 48, "0000009999")],
      ["nombre con punto", sustituir(C(P1), 61, ".")],
      ["nombre con C1", sustituir(C(P1), 128, [0x80])],
      ["primer apellido vacío", sustituir(C(P1), 58, nulos(23))],
      ["primer nombre vacío", sustituir(C(P1), 104, nulos(23))],
      ["basura tras el relleno", sustituir(C(P1), 70, "X")],
      ["espacio inicial", sustituir(C(P1), 58, " PEREZ")],
      ["espacio final", sustituir(C(P1), 63, " ")],
      ["doble espacio", sustituir(C(P1), 58, "DE  LA")],
      ["espacio final en un campo lleno junto a una letra", sustituir(C(P8), 103, " ")],
      ["espacio inicial tras un campo lleno", sustituir(C(P8), 104, " JUAN")],
      ["relleno con espacios", rellenoConEspacios()],
      ["bloque desplazado", insertar(C(P1), 150, [0])],
      ["bloque con 5 dígitos", C(P1, "0M2000022916001O+")],
      ["bloque con 7 dígitos", C(P1, "0M200002291600100O+")],
      ["fecha inválida", sustituir(C(P1), 152, "20000230")],
      ["fecha primero", C_F(P1)],
      ["trama corta", C(P1).subarray(0, 167)],
      ["trama hasta el apellido", C(P1).subarray(0, 70)],
    ];
    for (const [nombre, trama] of casos) expect([nombre, leerOffsets(trama)]).toStrictEqual([nombre, null]);
  });

  it("PA-07 El signo es el último byte leído (atrapa: leer la cola tras el RH)", () => {
    expect(leerOffsets(C(P1).subarray(0, 168))?.campos).toStrictEqual(CAMPOS_P1);
    expect(leerOffsets(C(P3).subarray(0, 169))?.campos.rh).toBe("AB+");
  });
});

describe("PA-07 Modo offsets en la trama completa", () => {
  it("PA-07 Lectura por offsets (atrapa: usar patrones cuando la trama es completa)", () => {
    const r = exito(parsearPdf417Amarilla(C(P4)));
    expect(r.trama.modo).toBe("offsets");
    expect([r.campos.primerApellido, r.campos.segundoApellido]).toStrictEqual(["DE LA OSSA", "DEL CASTILLO"]);
  });

  it("PA-07 Campo de nombre lleno sin relleno (atrapa: unir campos contiguos)", () => {
    const r = exito(parsearPdf417Amarilla(C(P8)));
    expect(r.trama.modo).toBe("offsets");
    expect([r.campos.segundoApellido, r.campos.primerNombre, r.campos.segundoNombre]).toStrictEqual([
      "ABCDEFGHIJKLMNOPQRSTUVW",
      "JUAN",
      "CARLOS",
    ]);
  });

  it("PA-07 Bloque desplazado activa el respaldo (atrapa: devolver error si fallan los offsets)", () => {
    const r = exito(parsearPdf417Amarilla(insertar(C(P1), 150, [0])));
    expect(r.trama).toStrictEqual({ variante: "completa", modo: "patrones", bloqueDemografico: "sexo-primero" });
    expect(r.campos).toStrictEqual(CAMPOS_P1);
  });

  it("PA-07 Relleno con espacios activa el respaldo (atrapa: aceptar espacios de relleno en offsets)", () => {
    const r = exito(parsearPdf417Amarilla(rellenoConEspacios()));
    expect(r.trama.modo).toBe("patrones");
    expect(r.campos).toStrictEqual(CAMPOS_P1);
  });

  it("PA-07 Patrones sin resultado no impide los offsets (atrapa: exigir los dos modos)", () => {
    const r = exito(parsearPdf417Amarilla(sustituir(C(P1), 10, "X")));
    expect(r.trama.modo).toBe("offsets");
    expect(r.campos).toStrictEqual(CAMPOS_P1);
  });

  it("PA-07 Si fallan los dos modos se devuelve el error de patrones (atrapa: ocultar el motivo)", () => {
    expect(parsearPdf417Amarilla(sustituir(C(P1), 152, "20000230"))).toStrictEqual({ ok: false, error: "fecha-nacimiento-invalida" });
  });
});

describe("PA-05, PA-09 y PA-10 en la trama completa", () => {
  it("PA-05 Ñ y vocales acentuadas en la trama completa (atrapa: Ñ que rompe el parser o caracteres de reemplazo)", () => {
    const r = exito(parsearPdf417Amarilla(C(P2)));
    expect([r.campos.primerApellido, r.campos.segundoApellido, r.campos.primerNombre, r.campos.segundoNombre]).toStrictEqual([
      "PE" + N + "A",
      "NU" + N + "EZ",
      "JOS" + String.fromCharCode(0xc9),
      String.fromCharCode(0xc1) + "NGEL",
    ]);
    for (const v of Object.values(r.campos)) expect(String(v)).not.toContain(String.fromCharCode(0xfffd));
  });

  it("PA-05 Ñ como primera letra del primer apellido (atrapa: [A-Z] para la primera letra del apellido)", () => {
    for (const trama of [C(P5), W(P5)]) {
      const r = exito(parsearPdf417Amarilla(trama));
      expect([r.campos.primerApellido, r.campos.numeroDocumento]).toStrictEqual([N + "USTES", "9999000004"]);
    }
  });

  it("PA-05 Nombre codificado en UTF-8 se rechaza (atrapa: aceptar bytes UTF-8)", () => {
    const c = sustituir(C(P2), 58, [0x50, 0x45, 0xc3, 0x91, 0x41, 0]);
    expect(parsearPdf417Amarilla(c)).toStrictEqual(CARACTERES_INVALIDOS);
  });

  it("PA-05 Bytes de control C1 no se convierten en texto (atrapa: 0x80 como euro o como espacio)", () => {
    expect(parsearPdf417Amarilla(sustituir(C(P1), 128, [0x80]))).toStrictEqual(CARACTERES_INVALIDOS);
  });

  it("PA-09 Cédula antigua con ceros a la izquierda (atrapa: conservar los ceros)", () => {
    for (const trama of [C(P6), W(P6)]) {
      const r = exito(parsearPdf417Amarilla(trama));
      expect(r.campos.numeroDocumento).toBe("99990005");
      expect(r.validaciones[0]).toStrictEqual({ id: "formato-nuip", estado: "ok", campos: ["numeroDocumento"], detalle: "cedula-antigua" });
    }
  });

  it("PA-09 Límites de formato-nuip (atrapa: reglas de longitud distintas de formato-nuip)", () => {
    const r = exito(parsearPdf417Amarilla(sustituir(C(P1), 48, "0000099999")));
    expect(r.campos.numeroDocumento).toBe("99999");
    expect(r.validaciones[0]?.detalle).toBe("cedula-antigua");
    for (const campo of ["0000009999", "0000000000"]) {
      expect(parsearPdf417Amarilla(sustituir(C(P1), 48, campo))).toStrictEqual({ ok: false, error: "nuip-invalido" });
    }
  });

  it("PA-09 Tarjeta decadactilar de 6 dígitos con relleno (atrapa: exigir 8 dígitos en [40,48))", () => {
    const r = exito(parsearPdf417Amarilla(sustituir(C(P1), 40, [...latin1("999977"), 0, 0])));
    expect(r.trama.modo).toBe("offsets");
    expect(r.campos).toStrictEqual(CAMPOS_P1);
    expect(r.validaciones[1]?.estado).toBe("ok");
  });

  it("PA-09 Sin corrección de confusiones OCR (atrapa: corregir O por 0 en el número)", () => {
    expect(parsearPdf417Amarilla(sustituir(C(P1), 56, "O"))).toStrictEqual(CARACTERES_INVALIDOS);
  });

  it("PA-10 Orden de los apellidos verificado por posición (atrapa: apellidos invertidos)", () => {
    const p1 = exito(parsearPdf417Amarilla(C(P1)));
    const p6 = exito(parsearPdf417Amarilla(C(P6)));
    expect([p1.campos.primerApellido, p1.campos.segundoApellido]).toStrictEqual(["PEREZ", "GOMEZ"]);
    expect([p6.campos.primerApellido, p6.campos.segundoApellido]).toStrictEqual(["GOMEZ", "PEREZ"]);
  });

  it("PA-10 Segundo nombre ausente (atrapa: desplazar campos; H15 solo sin offsets)", () => {
    const esperado = {
      numeroDocumento: "9999000002",
      primerApellido: "MARTINEZ",
      segundoApellido: "MEJIA",
      primerNombre: "MARIA",
      segundoNombre: null,
      sexo: "F",
      fechaNacimiento: "1970-01-01",
      rh: "AB+",
      codigoDepartamentoNacimiento: "31",
      codigoMunicipioNacimiento: "019",
    };
    const c = exito(parsearPdf417Amarilla(C(P3)));
    const w = exito(parsearPdf417Amarilla(W(P3)));
    expect(c.campos).toStrictEqual(esperado);
    expect(w.campos).toStrictEqual(esperado);
    expect(c.warnings).not.toContain("H15");
    expect(w.warnings).toContain("H15");
  });

  it("PA-10 Segundo apellido ausente en la trama completa (atrapa: correr los nombres hacia el apellido)", () => {
    const r = exito(parsearPdf417Amarilla(C(P7)));
    expect([r.campos.segundoApellido, r.campos.primerNombre, r.campos.segundoNombre]).toStrictEqual([null, "JOHN", "PAUL"]);
  });
});
