// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla, validarFormatoNuip } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import { leerSegmento, localizarNuip, normalizarByte, saltarFrontera } from "../src/pdf417-amarilla/patrones.js";
import {
  C,
  P1,
  P2,
  P3,
  P4,
  P5,
  P6,
  P7,
  S,
  W,
  insertar,
  latin1,
  nulos,
  quitar,
  sinNulosHasta,
  sustituir,
  truncar,
} from "./ayudas/tramas-referencia.js";

const RANGOS_LETRA: [number, number][] = [
  [0x41, 0x5a],
  [0x61, 0x7a],
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0xff],
];
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

function bytesDe(texto: string): Uint8Array {
  return Uint8Array.from(latin1(texto));
}

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

describe("PA-08 Normalizador 1:1 (patrones.ts)", () => {
  it("PA-08 Tabla de los 256 bytes: letras, dígitos, + - _ y 0x20 se conservan; el resto pasa a 0x20 (atrapa: borrar el - del RH o la Ñ)", () => {
    const conservados = (b: number) =>
      RANGOS_LETRA.some(([lo, hi]) => b >= lo && b <= hi) ||
      (b >= 0x30 && b <= 0x39) ||
      b === 0x2b ||
      b === 0x2d ||
      b === 0x5f ||
      b === 0x20;
    for (let b = 0; b < 256; b++) expect([b, normalizarByte(b)]).toStrictEqual([b, conservados(b) ? b : 0x20]);
  });
});

describe("PA-08 Segmentador por fronteras de 2 o más espacios (patrones.ts)", () => {
  it("PA-08 Un espacio aislado queda dentro del campo y dos son frontera (atrapa: separar por espacio simple)", () => {
    expect(leerSegmento(bytesDe("DE LA OSSA\0\0DEL"), 0)).toStrictEqual({
      fin: 10,
      esNombre: true,
      crudoValido: true,
      texto: "DE LA OSSA",
    });
    expect(leerSegmento(bytesDe("DE\0LA  X"), 0)).toStrictEqual({ fin: 5, esNombre: true, crudoValido: true, texto: "DE LA" });
  });

  it("PA-08 El fin de la entrada y un espacio final cierran el campo (atrapa: leer fuera de la entrada)", () => {
    expect(leerSegmento(bytesDe("PEREZ"), 0)).toStrictEqual({ fin: 5, esNombre: true, crudoValido: true, texto: "PEREZ" });
    expect(leerSegmento(bytesDe("PEREZ "), 0)).toStrictEqual({ fin: 5, esNombre: true, crudoValido: true, texto: "PEREZ" });
    expect(leerSegmento(bytesDe("XXPEREZ\0\0"), 2)).toStrictEqual({ fin: 7, esNombre: true, crudoValido: true, texto: "PEREZ" });
  });

  it("PA-08 Bytes no permitidos dentro de un nombre se marcan sin cambiar las posiciones (atrapa: normalizar UTF-8 o C1 como espacio válido)", () => {
    expect(leerSegmento(bytesDe("PER.Z\0\0"), 0)).toStrictEqual({ fin: 5, esNombre: true, crudoValido: false, texto: "PER Z" });
    expect(leerSegmento(Uint8Array.from([0x43, 0x80, 0x52, 0, 0]), 0)).toStrictEqual({
      fin: 3,
      esNombre: true,
      crudoValido: false,
      texto: "C R",
    });
  });

  it("PA-08 Un campo con dígitos o con _ no es nombre (atrapa: aceptar el marcador o el bloque como nombre)", () => {
    expect(leerSegmento(bytesDe("O6PEREZ\0\0"), 0).esNombre).toBe(false);
    expect(leerSegmento(bytesDe("PubDSK_1\0\0"), 0).esNombre).toBe(false);
    expect(leerSegmento(bytesDe("AB+\0\0"), 0).esNombre).toBe(false);
    expect(leerSegmento(bytesDe("AB-\0\0"), 0).esNombre).toBe(false);
  });

  it("PA-16 Un campo que llega a la posición 192 no es nombre (atrapa: leer la cola como nombre)", () => {
    const bytes = new Uint8Array(300).fill(0x41);
    expect(leerSegmento(bytes, 180)).toStrictEqual({ fin: 192, esNombre: false, crudoValido: true, texto: "AAAAAAAAAAAA" });
    const corto = sustituir(bytes, 191, [0, 0]);
    expect(leerSegmento(corto, 180)).toStrictEqual({ fin: 191, esNombre: true, crudoValido: true, texto: "AAAAAAAAAAA" });
  });

  it("PA-08 saltarFrontera avanza sobre separadores normalizados hasta 192 (atrapa: saltar letras o cruzar el límite)", () => {
    expect(saltarFrontera(bytesDe("AB\0\0 .\x01CD"), 2)).toBe(7);
    expect(saltarFrontera(bytesDe("AB"), 2)).toBe(2);
    expect(saltarFrontera(bytesDe("AB\0\0"), 2)).toBe(4);
    expect(saltarFrontera(new Uint8Array(300), 150)).toBe(192);
    expect(saltarFrontera(bytesDe("-X"), 0)).toBe(0);
  });
});

describe("PA-09 Localizador del NUIP (patrones.ts)", () => {
  it("PA-09 Los 10 dígitos anteriores a la primera letra en C, W y S (atrapa: tomar la tarjeta decadactilar)", () => {
    expect(localizarNuip(C(P1))).toStrictEqual({ inicio: 48, fin: 58 });
    expect(localizarNuip(W(P1))).toStrictEqual({ inicio: 37, fin: 47 });
    expect(localizarNuip(S(P1))).toStrictEqual({ inicio: 49, fin: 59 });
  });

  it("PA-09 Un run de 10 seguido de algo que no es letra se salta (atrapa: tomar el AFIS seguido de NUL)", () => {
    expect(localizarNuip(bytesDe("0199998888\0" + "9999123456P"))).toStrictEqual({ inicio: 11, fin: 21 });
    expect(localizarNuip(bytesDe("9999123456+P"))).toBeNull();
  });

  it("PA-09 Un run de 9 dígitos no basta y uno de 10 sí (atrapa: exigir más o menos de 10)", () => {
    expect(localizarNuip(bytesDe("999912345P"))).toBeNull();
    expect(localizarNuip(bytesDe("9999123456P"))).toStrictEqual({ inicio: 0, fin: 10 });
    expect(localizarNuip(bytesDe("\u00009999123456" + N))).toStrictEqual({ inicio: 1, fin: 11 });
  });

  it("PA-09 El marcador pegado a los dígitos no es un apellido (atrapa: tomar el AFIS como número)", () => {
    expect(localizarNuip(quitar(C(P1), 10, 24))).toStrictEqual({ inicio: 34, fin: 44 });
    expect(localizarNuip(bytesDe("0199998888PubDSK_X"))).toStrictEqual({ inicio: 0, fin: 10 });
  });

  it("PA-16 Límite 96 para el último dígito (atrapa: leer la biometría como número)", () => {
    expect(localizarNuip(insertar(C(P1), 40, nulos(38)))).toStrictEqual({ inicio: 86, fin: 96 });
    expect(localizarNuip(insertar(C(P1), 40, nulos(39)))).toBeNull();
  });
});

describe("PA-08 a PA-10 Escenarios del modo patrones", { timeout: 60_000 }, () => {
  it("PA-08 Trama truncada igual que la completa (atrapa: offsets absolutos en la trama de Windows)", () => {
    const w = exito(parsearPdf417Amarilla(W(P1)));
    expect(w.campos).toStrictEqual(exito(parsearPdf417Amarilla(C(P1))).campos);
    expect(w.campos).toStrictEqual(CAMPOS_P1);
    expect(w.trama).toStrictEqual({ variante: "truncada", modo: "patrones", bloqueDemografico: "sexo-primero" });
  });

  it("PA-08 Apellidos compuestos en modo patrones (atrapa: partir DE LA OSSA por el espacio)", () => {
    const r = exito(parsearPdf417Amarilla(W(P4)));
    expect([r.campos.primerApellido, r.campos.segundoApellido, r.campos.primerNombre, r.campos.segundoNombre]).toStrictEqual([
      "DE LA OSSA",
      "DEL CASTILLO",
      "ANA",
      "LUCIA",
    ]);
  });

  it("PA-08 Trama sin PubDSK (atrapa: exigir el marcador)", () => {
    const r = exito(parsearPdf417Amarilla(S(P1)));
    expect(r.trama).toStrictEqual({ variante: "sin-pubdsk", modo: "patrones", bloqueDemografico: "sexo-primero" });
    expect(r.campos).toStrictEqual(CAMPOS_P1);
  });

  it("PA-08 Trama sin ningún NUL da error y no nombres partidos (atrapa: inventar fronteras entre nombres, H14)", () => {
    expect(parsearPdf417Amarilla(sinNulosHasta(C(P1), 168))).toStrictEqual(CARACTERES_INVALIDOS);
  });

  it("PA-09 Cédula antigua con ceros a la izquierda en la trama truncada (atrapa: conservar ceros a la izquierda)", () => {
    const r = exito(parsearPdf417Amarilla(W(P6)));
    expect(r.campos.numeroDocumento).toBe("99990005");
    expect(r.validaciones[0]).toStrictEqual({ id: "formato-nuip", estado: "ok", campos: ["numeroDocumento"], detalle: "cedula-antigua" });
  });

  it("PA-09 La tarjeta decadactilar no se toma como número (atrapa: tomar los 18 dígitos o los 10 primeros)", () => {
    expect(exito(parsearPdf417Amarilla(W(P1))).campos.numeroDocumento).toBe("9999123456");
  });

  it("PA-09 Marcador pegado a la cabecera (atrapa: tomar el AFIS como número y el marcador como apellido)", () => {
    const r = exito(parsearPdf417Amarilla(quitar(C(P1), 10, 24)));
    expect(r.trama.variante).toBe("truncada");
    expect(r.campos).toStrictEqual(CAMPOS_P1);
    expect(r.warnings).toStrictEqual(["H02"]);
  });

  it("PA-09 Propiedad de oráculo: campo NUIP con k ceros a la izquierda (atrapa: reglas de formato duplicadas o distintas de formato-nuip)", () => {
    let validos = 0;
    let invalidos = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }).chain((k) =>
          fc.tuple(fc.constant(k), fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 10 - k, maxLength: 10 - k })),
        ),
        ([k, digitos]) => {
          const campo = "0".repeat(k) + digitos;
          const oraculo = validarFormatoNuip(campo);
          const r = parsearPdf417Amarilla(sustituir(C(P1), 48, campo));
          if (oraculo.valido) {
            validos++;
            expect(r.ok).toBe(true);
            expect(r.ok && r.campos.numeroDocumento).toBe(oraculo.numero);
          } else {
            invalidos++;
            expect(r).toStrictEqual({ ok: false, error: "nuip-invalido" });
          }
        },
      ),
      { numRuns: 1000 },
    );
    expect(validos).toBeGreaterThanOrEqual(250);
    expect(invalidos).toBeGreaterThanOrEqual(100);
  });

  it("PA-10 Segundo nombre ausente en la trama truncada, con H15 (atrapa: desplazar campos)", () => {
    const r = exito(parsearPdf417Amarilla(W(P3)));
    expect(r.campos).toStrictEqual({
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
    });
    expect(r.warnings).toContain("H15");
  });

  it("PA-10 Ambigüedad documentada sin offsets (atrapa: ocultar la lectura dudosa de H15)", () => {
    const r = exito(parsearPdf417Amarilla(W(P7)));
    expect([r.campos.segundoApellido, r.campos.primerNombre, r.campos.segundoNombre]).toStrictEqual(["JOHN", "PAUL", null]);
    expect(r.warnings).toContain("H15");
    expect([r.confianza.segundoApellido, r.confianza.primerNombre, r.confianza.segundoNombre]).toStrictEqual([0.6, 0.6, 0.6]);
  });

  it("PA-10 Un solo nombre tras el primer apellido es el primer nombre (atrapa: tomarlo como segundo apellido)", () => {
    const r = exito(parsearPdf417Amarilla(truncar(sustituir(C(P1), 104, nulos(46)))));
    expect([r.campos.segundoApellido, r.campos.primerNombre, r.campos.segundoNombre]).toStrictEqual([null, "GOMEZ", null]);
    expect(r.warnings).toContain("H15");
  });

  it("PA-10 Demasiados campos de nombre (atrapa: descartar nombres sobrantes)", () => {
    const c = sustituir(C(P1), 127, [...latin1("CARLOS"), 0, 0, ...latin1("EXTRA")]);
    expect(parsearPdf417Amarilla(truncar(c))).toStrictEqual({ ok: false, error: "nombres-no-reconocidos" });
  });

  it("PA-10 Sin nombres entre el apellido y el bloque (atrapa: aceptar una persona sin nombre)", () => {
    expect(parsearPdf417Amarilla(truncar(sustituir(C(P1), 81, nulos(69))))).toStrictEqual({
      ok: false,
      error: "nombres-no-reconocidos",
    });
  });

  it("PA-05 Ñ como primera letra del primer apellido en la trama truncada (atrapa: clase [A-Z] para la primera letra)", () => {
    const r = exito(parsearPdf417Amarilla(W(P5)));
    expect(r.campos.primerApellido).toBe(N + "USTES");
    expect(r.campos.numeroDocumento).toBe("9999000004");
  });

  it("PA-05 Nombre codificado en UTF-8 se rechaza en la trama truncada (atrapa: aceptar bytes UTF-8 como Latin-1)", () => {
    const c = sustituir(C(P2), 58, [0x50, 0x45, 0xc3, 0x91, 0x41, 0]);
    expect(parsearPdf417Amarilla(truncar(c))).toStrictEqual(CARACTERES_INVALIDOS);
  });

  it("PA-05 Byte C1 en un nombre posterior al primer apellido (atrapa: convertir 0x80 en espacio)", () => {
    expect(parsearPdf417Amarilla(truncar(sustituir(C(P1), 128, [0x80])))).toStrictEqual(CARACTERES_INVALIDOS);
  });

  it("PA-16 Límites de posición 95/96 del número (atrapa: aceptar un NUIP dentro de la biometría)", () => {
    const r = exito(parsearPdf417Amarilla(insertar(C(P1), 40, nulos(38))));
    expect(r.campos).toStrictEqual(CAMPOS_P1);
    expect(parsearPdf417Amarilla(insertar(C(P1), 40, nulos(39)))).toStrictEqual({ ok: false, error: "nuip-no-encontrado" });
  });

  it("PA-16 Límites de posición 191/192 del bloque (atrapa: aceptar un bloque dentro de la biometría)", () => {
    const r = exito(parsearPdf417Amarilla(insertar(C(P1), 150, nulos(41))));
    expect(r.campos).toStrictEqual(CAMPOS_P1);
    expect(parsearPdf417Amarilla(insertar(C(P1), 150, nulos(42)))).toStrictEqual({
      ok: false,
      error: "bloque-demografico-no-encontrado",
    });
  });

  it("PA-03 Un campo tras el apellido que no es nombre ni bloque (atrapa: tomar el marcador como nombre)", () => {
    expect(parsearPdf417Amarilla(truncar(sustituir(C(P1), 81, "GO_EZ")))).toStrictEqual({
      ok: false,
      error: "bloque-demografico-no-encontrado",
    });
    expect(parsearPdf417Amarilla(truncar(sustituir(C(P1), 81, "+GOMEZ")))).toStrictEqual({
      ok: false,
      error: "bloque-demografico-no-encontrado",
    });
  });

  it("PA-08 Un guion aislado entre campos se conserva y no es frontera (atrapa: normalizador que borra el -)", () => {
    expect(parsearPdf417Amarilla(truncar(sustituir(C(P1), 70, "-")))).toStrictEqual({
      ok: false,
      error: "bloque-demografico-no-encontrado",
    });
  });

  it("PA-03 Fin de la entrada sin bloque (atrapa: leer más allá del final)", () => {
    expect(parsearPdf417Amarilla(W(P1).subarray(0, 125))).toStrictEqual({ ok: false, error: "bloque-demografico-no-encontrado" });
    expect(parsearPdf417Amarilla(W(P1).subarray(0, 123))).toStrictEqual({ ok: false, error: "bloque-demografico-no-encontrado" });
  });
});
