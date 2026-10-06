// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import { C, P1, extenderCola } from "./ayudas/tramas-referencia.js";

const NO_BYTES = { ok: false, error: "entrada-no-bytes" };
const OPCIONES_INVALIDAS = { ok: false, error: "opciones-invalidas" };
const VACIA = { ok: false, error: "entrada-vacia" };
const DEMASIADO_LARGA = { ok: false, error: "entrada-demasiado-larga" };

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

describe("PA-01 Entrada admitida", () => {
  it("PA-01 Valores que no son bytes (atrapa: aceptar texto, arreglos, ArrayBuffer u otras vistas tipadas)", () => {
    const valores: unknown[] = ["0M2000", [48, 49], new ArrayBuffer(531), new Uint16Array(531), null, undefined];
    for (const v of valores) expect(parsearPdf417Amarilla(v)).toStrictEqual(NO_BYTES);
  });

  it("PA-01 Entrada vacía (atrapa: interpretar una trama vacía)", () => {
    expect(parsearPdf417Amarilla(new Uint8Array(0))).toStrictEqual(VACIA);
  });

  it("PA-01 Límite de longitud (atrapa: rechazar 2048 bytes o aceptar 2049)", () => {
    const r2048 = parsearPdf417Amarilla(extenderCola(C(P1), 2048));
    expect(r2048.ok).toBe(true);
    expect(r2048.ok && r2048.campos).toStrictEqual(CAMPOS_P1);
    expect(parsearPdf417Amarilla(extenderCola(C(P1), 2049))).toStrictEqual(DEMASIADO_LARGA);
  });

  it("PA-01 Vista con desplazamiento y Buffer (atrapa: leer el buffer subyacente desde 0 o rechazar subclases)", () => {
    const buf = Uint8Array.from([...new Array<number>(7).fill(0xff), ...C(P1), ...new Array<number>(5).fill(0xff)]);
    const referencia = parsearPdf417Amarilla(C(P1));
    expect(parsearPdf417Amarilla(buf.subarray(7, 538))).toStrictEqual(referencia);
    expect(parsearPdf417Amarilla(Buffer.from(C(P1)))).toStrictEqual(referencia);
  });
});

describe("PA-03 Prioridad de los motivos de entrada", () => {
  it("PA-03 Prioridad de los motivos de entrada (atrapa: comprobar longitud u opciones en otro orden)", () => {
    expect(parsearPdf417Amarilla("x", 5)).toStrictEqual(NO_BYTES);
    expect(parsearPdf417Amarilla(new Uint8Array(0), 5)).toStrictEqual(OPCIONES_INVALIDAS);
    expect(parsearPdf417Amarilla(new Uint8Array(0))).toStrictEqual(VACIA);
    expect(parsearPdf417Amarilla(new Uint8Array(2049))).toStrictEqual(DEMASIADO_LARGA);
  });

  it("PA-03 La longitud no se examina antes que las opciones (atrapa: entrada larga que oculta opciones inválidas)", () => {
    expect(parsearPdf417Amarilla(new Uint8Array(2049), [])).toStrictEqual(OPCIONES_INVALIDAS);
  });
});

describe("PA-15 Opciones inválidas", () => {
  it("PA-15 Opciones inválidas (atrapa: aceptar primitivos, arreglos, funciones o un divipol que no es función)", () => {
    const opciones: unknown[] = [5, "x", true, [], () => 1, { divipol: null }, { divipol: 5 }, { divipol: {} }, { divipol: "16001" }];
    for (const o of opciones) expect(parsearPdf417Amarilla(C(P1), o)).toStrictEqual(OPCIONES_INVALIDAS);
  });

  it("PA-15 Opciones ausentes (atrapa: rechazar undefined, null u objeto vacío)", () => {
    const referencia = parsearPdf417Amarilla(C(P1));
    expect(referencia.ok).toBe(true);
    for (const o of [undefined, null, {}]) expect(parsearPdf417Amarilla(C(P1), o)).toStrictEqual(referencia);
  });

  it("PA-15 divipol se lee una sola vez (atrapa: leer la propiedad varias veces)", () => {
    let lecturas = 0;
    const opciones = {
      get divipol() {
        lecturas++;
        return undefined;
      },
    };
    expect(parsearPdf417Amarilla(C(P1), opciones).ok).toBe(true);
    expect(lecturas).toBe(1);
  });
});

describe("PA-04 Nunca lanza con valores arbitrarios y entradas largas", { timeout: 60_000 }, () => {
  it("PA-04 Nunca lanza con valores arbitrarios como bytes (atrapa: excepciones con valores que no son bytes)", () => {
    let noBytes = 0;
    fc.assert(
      fc.property(fc.anything(), (valor) => {
        if (valor instanceof Uint8Array) return;
        noBytes++;
        expect(parsearPdf417Amarilla(valor)).toStrictEqual(NO_BYTES);
      }),
      { numRuns: 1000 },
    );
    expect(noBytes).toBeGreaterThanOrEqual(990);
  });

  it("PA-04 Nunca lanza con valores arbitrarios como opciones de C(P1) (atrapa: excepciones al leer opciones)", () => {
    const c = C(P1);
    let exitos = 0;
    let invalidas = 0;
    fc.assert(
      fc.property(fc.anything(), (opciones) => {
        const r = parsearPdf417Amarilla(c, opciones);
        if (r.ok) {
          exitos++;
          expect(r.campos).toStrictEqual(CAMPOS_P1);
        } else {
          invalidas++;
          expect(r).toStrictEqual(OPCIONES_INVALIDAS);
        }
      }),
      { numRuns: 1000 },
    );
    expect(exitos).toBeGreaterThanOrEqual(100);
    expect(invalidas).toBeGreaterThanOrEqual(100);
  });

  it("PA-04 Entradas largas (atrapa: examinar el contenido de una entrada de más de 2048 bytes)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 2049, maxLength: 4096 }), (bytes) => {
        expect(parsearPdf417Amarilla(bytes)).toStrictEqual(DEMASIADO_LARGA);
      }),
      { numRuns: 1000 },
    );
  });
});
