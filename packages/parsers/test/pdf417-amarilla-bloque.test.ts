// fixture-sintetico: tramas de referencia ficticias (NUIP 9999...) de la spec parser-pdf417-amarilla.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsearPdf417Amarilla } from "../src/index.js";
import type { ResultadoPdf417Amarilla } from "../src/index.js";
import {
  fechaIso,
  interpretarBloque,
  reconocerBloque,
  reconocerFechaPrimero,
  reconocerSexoPrimero,
} from "../src/pdf417-amarilla/bloque-demografico.js";
import { C, C_F, P1, P2, P3, P4, P5, P6, P7, P8, S, W, W_F, latin1, sustituir } from "./ayudas/tramas-referencia.js";

const FECHA_INVALIDA = { ok: false, error: "fecha-nacimiento-invalida" };

function bytesDe(texto: string): Uint8Array {
  return Uint8Array.from(latin1(texto));
}

function exito(r: ResultadoPdf417Amarilla): Extract<ResultadoPdf417Amarilla, { ok: true }> {
  if (!r.ok) throw new Error(`se esperaba éxito y llegó ${r.error}`);
  return r;
}

/** C(P1) con otra fecha en el bloque sexo primero (bytes 152 a 160). */
function conFecha(fecha: string): Uint8Array {
  return sustituir(C(P1), 152, fecha);
}

describe("PA-11 y PA-12 Reconocedores de un solo paso (bloque-demografico.ts)", () => {
  it("PA-11 Sexo primero con 6 dígitos y RH de 2 bytes (atrapa: leer el bloque por otra forma)", () => {
    expect(reconocerSexoPrimero(bytesDe("0M20000229160010O+"), 0)).toStrictEqual({
      forma: "sexo-primero",
      sexo: "M",
      fecha: "20000229",
      digitos: "160010",
      rh: "O+",
    });
  });

  it("PA-13 RH AB se lee antes que A o B y conserva el signo (atrapa: cortar AB+ a B+ o perder el -)", () => {
    const rh = (texto: string) => reconocerSexoPrimero(bytesDe(texto), 0)?.rh ?? null;
    expect(rh("0F19700101310190AB+")).toBe("AB+");
    expect(rh("0F19700101310190AB-")).toBe("AB-");
    expect(rh("0F19700101310190A+")).toBe("A+");
    expect(rh("0F19700101310190A-")).toBe("A-");
    expect(rh("0F19700101310190B+")).toBe("B+");
    expect(rh("0F19700101310190B-")).toBe("B-");
    expect(rh("0F19700101310190O+")).toBe("O+");
    expect(rh("0F19700101310190O-")).toBe("O-");
  });

  it("PA-13 RH sin signo o con grupo desconocido no es bloque (atrapa: inventar el signo o aceptar AB sin signo)", () => {
    for (const t of [
      "0F19700101310190AB",
      "0F19700101310190ABX",
      "0F19700101310190AB0",
      "0F19700101310190A",
      "0F19700101310190A0",
      "0F19700101310190C+",
      "0F19700101310190",
      "0F19700101310190a+",
      "0F19700101310190BA+",
    ]) {
      expect([t, reconocerSexoPrimero(bytesDe(t), 0)]).toStrictEqual([t, null]);
    }
  });

  it("PA-11 Cualquier cantidad de dígitos entre la fecha y el RH (atrapa: exigir 6 en el reconocedor)", () => {
    expect(reconocerSexoPrimero(bytesDe("0M20000229O+"), 0)?.digitos).toBe("");
    expect(reconocerSexoPrimero(bytesDe("0M2000022916001O+"), 0)?.digitos).toBe("16001");
    expect(reconocerSexoPrimero(bytesDe("0M200002291600100O+"), 0)?.digitos).toBe("1600100");
  });

  it("PA-20 Primer carácter P/A/R o sexo fuera de M/F no es bloque (atrapa: interpretar P/A/R o deducir el sexo por contenido)", () => {
    for (const t of ["PM20000229160010O+", "AM20000229160010O+", "0X20000229160010O+", "0m20000229160010O+", "0M2000022X160010O+", "0M2000022"]) {
      expect([t, reconocerSexoPrimero(bytesDe(t), 0)]).toStrictEqual([t, null]);
    }
  });

  it("PA-11 Lee desde la posición pedida sin mirar antes (atrapa: anclar el bloque en 0)", () => {
    expect(reconocerSexoPrimero(bytesDe("XX0F19700101310190AB+"), 2)?.rh).toBe("AB+");
    expect(reconocerSexoPrimero(bytesDe("XX0F19700101310190AB+"), 0)).toBeNull();
  });

  it("PA-12 Fecha primero (atrapa: leer la fecha en la posición de sexo primero)", () => {
    expect(reconocerFechaPrimero(bytesDe("0220000229M160010O+"), 0)).toStrictEqual({
      forma: "fecha-primero",
      sexo: "M",
      fecha: "20000229",
      digitos: "160010",
      rh: "O+",
    });
    expect(reconocerFechaPrimero(bytesDe("0219700101F310190AB+"), 0)?.rh).toBe("AB+");
    for (const t of ["0M20000229160010O+", "X220000229M160010O+", "0X20000229M160010O+", "0220000229X160010O+", "022000022XM160010O+", "0220000229M160010"]) {
      expect([t, reconocerFechaPrimero(bytesDe(t), 0)]).toStrictEqual([t, null]);
    }
  });

  it("PA-12 reconocerBloque elige la forma por el segundo carácter (atrapa: formas solapadas)", () => {
    expect(reconocerBloque(bytesDe("0M20000229160010O+"), 0)?.forma).toBe("sexo-primero");
    expect(reconocerBloque(bytesDe("0F19700101310190AB+"), 0)?.forma).toBe("sexo-primero");
    expect(reconocerBloque(bytesDe("0220000229M160010O+"), 0)?.forma).toBe("fecha-primero");
    expect(reconocerBloque(bytesDe("0X20000229M160010O+"), 0)).toBeNull();
    expect(reconocerBloque(bytesDe("+M20000229160010O+"), 0)).toBeNull();
  });
});

describe("PA-14 Fecha gregoriana 1900-2099 (fechaIso)", () => {
  it("PA-14 Válidas en los límites y bisiestos (atrapa: regla bisiesta sin la excepción de 1900 o de 2000)", () => {
    expect(fechaIso("20000229")).toBe("2000-02-29");
    expect(fechaIso("19000101")).toBe("1900-01-01");
    expect(fechaIso("20991231")).toBe("2099-12-31");
    expect(fechaIso("20240229")).toBe("2024-02-29");
    expect(fechaIso("20230430")).toBe("2023-04-30");
  });

  it("PA-14 Inválidas (atrapa: aceptar el 29 de febrero de 1900, el día 0, el mes 13 o años fuera de rango)", () => {
    for (const f of ["19000229", "20000230", "20001301", "20000100", "18991231", "21000101", "20000001", "20000132", "20230431", "20230229", "21000229"]) {
      expect([f, fechaIso(f)]).toStrictEqual([f, null]);
    }
  });
});

describe("PA-11 y PA-12 Interpretación del bloque (DIVIPOL)", () => {
  it("PA-11 Seis dígitos: departamento 2 y municipio 3; el sexto se descarta (atrapa: lectura 3+3 de Yeison07)", () => {
    expect(interpretarBloque({ forma: "sexo-primero", sexo: "F", fecha: "19700101", digitos: "310190", rh: "AB+" })).toStrictEqual({
      sexo: "F",
      fechaNacimiento: "1970-01-01",
      rh: "AB+",
      codigoDepartamentoNacimiento: "31",
      codigoMunicipioNacimiento: "019",
      divipol: "ok",
    });
  });

  it("PA-11 Otra cantidad de dígitos da códigos null (atrapa: cortar o rellenar los códigos)", () => {
    for (const digitos of ["16001", "1600100", ""]) {
      expect(interpretarBloque({ forma: "sexo-primero", sexo: "M", fecha: "20000229", digitos, rh: "O+" })).toStrictEqual({
        sexo: "M",
        fechaNacimiento: "2000-02-29",
        rh: "O+",
        codigoDepartamentoNacimiento: null,
        codigoMunicipioNacimiento: null,
        divipol: "longitud-inesperada",
      });
    }
  });

  it("PA-12 Fecha primero nunca da códigos DIVIPOL (atrapa: afirmar DIVIPOL sin evidencia)", () => {
    expect(interpretarBloque({ forma: "fecha-primero", sexo: "M", fecha: "20000229", digitos: "160010", rh: "O+" })).toStrictEqual({
      sexo: "M",
      fechaNacimiento: "2000-02-29",
      rh: "O+",
      codigoDepartamentoNacimiento: null,
      codigoMunicipioNacimiento: null,
      divipol: "bloque-sin-divipol",
    });
  });

  it("PA-14 Fecha imposible da null (atrapa: entregar una fecha inválida)", () => {
    expect(interpretarBloque({ forma: "sexo-primero", sexo: "M", fecha: "20000230", digitos: "160010", rh: "O+" })).toBeNull();
  });
});

describe("PA-11 a PA-14 Escenarios", { timeout: 60_000 }, () => {
  it("PA-11 Departamento de 2 y municipio de 3 (atrapa: 310 y 190)", () => {
    const r = exito(parsearPdf417Amarilla(C(P3)));
    expect([r.campos.codigoDepartamentoNacimiento, r.campos.codigoMunicipioNacimiento]).toStrictEqual(["31", "019"]);
  });

  it("PA-11 Códigos en cero se conservan (atrapa: tratar 00 y 000 como vacíos)", () => {
    const r = exito(parsearPdf417Amarilla(C(P5)));
    expect([r.campos.codigoDepartamentoNacimiento, r.campos.codigoMunicipioNacimiento]).toStrictEqual(["00", "000"]);
  });

  it("PA-11 Cantidad inesperada de dígitos (atrapa: inventar códigos con 5 o 7 dígitos)", () => {
    for (const bloque of ["0M2000022916001O+", "0M200002291600100O+"]) {
      const r = exito(parsearPdf417Amarilla(C(P1, bloque)));
      expect(r.trama.modo).toBe("patrones");
      expect([r.campos.codigoDepartamentoNacimiento, r.campos.codigoMunicipioNacimiento]).toStrictEqual([null, null]);
      expect([r.confianza.codigoDepartamentoNacimiento, r.confianza.codigoMunicipioNacimiento]).toStrictEqual([0, 0]);
      expect(r.validaciones[2]).toStrictEqual({
        id: "divipol-codigos",
        estado: "fallida",
        campos: ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"],
        detalle: "longitud-inesperada",
      });
      expect(r.warnings).toStrictEqual([]);
    }
  });

  it("PA-12 Fecha primero en trama completa (atrapa: leer DIVIPOL o sexo en posiciones de sexo primero)", () => {
    const r = exito(parsearPdf417Amarilla(C_F(P1)));
    expect(r.trama).toStrictEqual({ variante: "completa", modo: "patrones", bloqueDemografico: "fecha-primero" });
    expect([r.campos.sexo, r.campos.fechaNacimiento, r.campos.rh]).toStrictEqual(["M", "2000-02-29", "O+"]);
    expect([r.campos.codigoDepartamentoNacimiento, r.campos.codigoMunicipioNacimiento]).toStrictEqual([null, null]);
    expect(r.warnings).toStrictEqual(["H08"]);
  });

  it("PA-12 Fecha primero en trama truncada con RH AB (atrapa: cortar AB en la forma fecha primero)", () => {
    const r = exito(parsearPdf417Amarilla(W_F(P3)));
    expect([r.campos.sexo, r.campos.fechaNacimiento, r.campos.rh]).toStrictEqual(["F", "1970-01-01", "AB+"]);
    expect(r.validaciones[2]).toStrictEqual({
      id: "divipol-codigos",
      estado: "no-aplica",
      campos: ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"],
      detalle: "bloque-sin-divipol",
    });
  });

  it("PA-13 Los ocho valores en la trama completa (atrapa: RH cortado o sin signo)", () => {
    const rh = [P1, P2, P3, P4, P5, P6, P7, P8].map((p) => exito(parsearPdf417Amarilla(C(p))).campos.rh);
    expect(rh).toStrictEqual(["O+", "AB-", "AB+", "O-", "B-", "A-", "B+", "A+"]);
  });

  it("PA-13 AB y negativos en modo patrones (atrapa: RH cortado en la trama truncada o sin PubDSK)", () => {
    const rh = [W(P2), W(P3), S(P4), S(P6)].map((t) => exito(parsearPdf417Amarilla(t)).campos.rh);
    expect(rh).toStrictEqual(["AB-", "AB+", "O-", "A-"]);
  });

  it("PA-14 Fechas válidas en los límites (atrapa: rechazar 1900, 2099 o el 29 de febrero de 2000)", () => {
    const fechas = ["20000229", "19000101", "20991231"].map((f) => exito(parsearPdf417Amarilla(conFecha(f))).campos.fechaNacimiento);
    expect(fechas).toStrictEqual(["2000-02-29", "1900-01-01", "2099-12-31"]);
  });

  it("PA-14 Fechas inválidas (atrapa: aceptar fechas imposibles o fuera de 1900-2099)", () => {
    for (const f of ["19000229", "20000230", "20001301", "20000100", "18991231", "21000101"]) {
      expect([f, parsearPdf417Amarilla(conFecha(f))]).toStrictEqual([f, FECHA_INVALIDA]);
    }
  });

  it("PA-14 Propiedad: fechas válidas por construcción e imposibles (atrapa: tabla de días o regla bisiesta errónea)", () => {
    /** Tabla literal de días por mes y regla bisiesta escritas en la prueba (oráculo independiente). */
    const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const bisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
    const dias = (a: number, m: number) => (m === 2 && bisiesto(a) ? 29 : (DIAS[m - 1] ?? 0));
    const dos = (n: number) => String(n).padStart(2, "0");
    const valida = fc
      .tuple(fc.integer({ min: 1900, max: 2099 }), fc.integer({ min: 1, max: 12 }))
      .chain(([a, m]) => fc.tuple(fc.constant(a), fc.constant(m), fc.integer({ min: 1, max: dias(a, m) })))
      .map(([a, m, d]) => ({ texto: `${a}${dos(m)}${dos(d)}`, iso: `${a}-${dos(m)}-${dos(d)}` as string | null }));
    const febrero29 = fc
      .constantFrom(1900, 1904, 1996, 2000, 2024, 2096, 2023, 2100)
      .filter((a) => a <= 2099)
      .map((a) => ({ texto: `${a}0229`, iso: bisiesto(a) ? `${a}-02-29` : null }));
    const imposible = fc
      .tuple(fc.integer({ min: 1900, max: 2099 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 4 }))
      .map(([a, m, tipo]) => {
        const casos = [`${a}${dos(m)}00`, `${a}${dos(m)}32`, `${a}00${dos(1)}`, `${a}1301`, `${a}${dos(m)}${dos(dias(a, m) + 1)}`];
        return { texto: casos[tipo] ?? "", iso: null as string | null };
      });
    const fueraDeRango = fc
      .oneof(fc.integer({ min: 1000, max: 1899 }), fc.integer({ min: 2100, max: 9999 }))
      .map((a) => ({ texto: `${a}0101`, iso: null as string | null }));
    let invalidas = 0;
    let feb29Bisiesto = 0;
    let total = 0;
    fc.assert(
      fc.property(fc.oneof(valida, febrero29, imposible, fueraDeRango), ({ texto, iso }) => {
        total++;
        if (iso === null) invalidas++;
        if (texto.endsWith("0229") && iso !== null) feb29Bisiesto++;
        const r = parsearPdf417Amarilla(conFecha(texto));
        if (iso === null) expect(r).toStrictEqual(FECHA_INVALIDA);
        else expect(r.ok && r.campos.fechaNacimiento).toBe(iso);
      }),
      { numRuns: 1000 },
    );
    expect(invalidas / total).toBeGreaterThanOrEqual(0.3);
    expect(feb29Bisiesto / total).toBeGreaterThanOrEqual(0.01);
  });
});
