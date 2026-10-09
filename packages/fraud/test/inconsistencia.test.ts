// FRA-11 y FRA-18 (cambio deteccion-fraude): consistencia de datos con reloj inyectado. Solo datos sintéticos.
import { PERSONA_BASE, arbFixtureMrz, generarMrzTd1 } from "@lector-cedula/fixtures";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectarInconsistencia } from "../src/detectores/inconsistencia.js";

const HOY = new Date("2026-10-08T12:00:00Z");
const reloj = () => HOY;
const MRZ = generarMrzTd1(PERSONA_BASE);

function cambiar(lineas: readonly string[], linea: number, pos: number, c: string): string[] {
  return lineas.map((l, i) => (i === linea ? l.slice(0, pos) + c + l.slice(pos + 1) : l));
}

describe("FRA-11 consistencia de datos", () => {
  it("FRA-11 nacimiento posterior a expedición", () => {
    const r = detectarInconsistencia("amarilla", { pdf417: { fechaNacimiento: "2005-03-01", fechaExpedicion: "2004-01-10" } }, reloj);
    expect(r.motivo).toStrictEqual({ codigo: "inconsistencia", puntaje: 1, detalle: "fecha-imposible" });
  });

  it("FRA-11 fechas futuras o de calendario inválido son imposibles", () => {
    for (const f of [{ fechaNacimiento: "2027-01-01" }, { fechaExpedicion: "2026-10-09" }, { fechaNacimiento: "2001-02-30" }, { fechaNacimiento: "ayer" }]) {
      expect(detectarInconsistencia("amarilla", { pdf417: f }, reloj).motivo?.detalle).toBe("fecha-imposible");
    }
    expect(detectarInconsistencia("amarilla", { pdf417: { fechaNacimiento: "2026-10-08", fechaExpedicion: "2026-10-08" } }, reloj).motivo).toBeNull();
  });

  it("FRA-11 municipio inexistente", () => {
    expect(detectarInconsistencia("amarilla", { pdf417: { codigoLugar: "99-999" } }, reloj).motivo?.detalle).toBe("municipio-inexistente");
    expect(detectarInconsistencia("amarilla", { pdf417: { codigoLugar: "99999" } }, reloj).motivo?.detalle).toBe("municipio-inexistente");
    expect(detectarInconsistencia("amarilla", { pdf417: { codigoLugar: "16-001" } }, reloj).motivo).toBeNull();
    // 00000 = lugar no registrado (D04): no es inexistente.
    expect(detectarInconsistencia("amarilla", { pdf417: { codigoLugar: "00000" } }, reloj).motivo).toBeNull();
  });

  it("FRA-11 digital vencida (MRZ con vencimiento 2026-01-31)", () => {
    const fx = generarMrzTd1({ ...PERSONA_BASE, fechaVencimiento: "2026-01-31" });
    const r = detectarInconsistencia("digital", { mrz: { lineas: fx.lineas } }, reloj);
    expect(r.motivo).toStrictEqual({ codigo: "inconsistencia", puntaje: 0.6, detalle: "vencido" });
    const vigente = detectarInconsistencia("digital", { mrz: { lineas: MRZ.lineas } }, reloj);
    expect(vigente.motivo).toBeNull();
  });

  it("FRA-11 dígito de control del número de documento erróneo", () => {
    const original = MRZ.lineas[0][14] as string;
    const alterado = original === "3" ? "4" : String((Number(original) + 1) % 10);
    const r = detectarInconsistencia("digital", { mrz: { lineas: cambiar(MRZ.lineas, 0, 14, alterado) } }, reloj);
    expect(r.motivo).toStrictEqual({ codigo: "inconsistencia", puntaje: 1, detalle: "digito-control" });
  });

  it("FRA-11 visible distinto del PDF417", () => {
    const r = detectarInconsistencia("amarilla", { pdf417: { nuip: "9999123456" }, visible: { nuip: "9999123457" } }, reloj);
    expect(r.motivo).toStrictEqual({ codigo: "inconsistencia", puntaje: 0.6, detalle: "pdf417-vs-visible" });
    expect(detectarInconsistencia("amarilla", { pdf417: { nuip: "9999123456" }, visible: { nuip: "9.999.123.456" } }, reloj).motivo).toBeNull();
  });

  it("FRA-11 visible distinto de la MRZ", () => {
    const r = detectarInconsistencia("digital", { mrz: { lineas: MRZ.lineas }, visible: { nuip: "9999123457" } }, reloj);
    expect(r.motivo?.detalle).toBe("mrz-vs-visible");
    expect(detectarInconsistencia("digital", { mrz: { lineas: MRZ.lineas }, visible: { nuip: PERSONA_BASE.nuip } }, reloj).motivo).toBeNull();
  });

  it("FRA-11 sin OCR del anverso", () => {
    const r = detectarInconsistencia("amarilla", { pdf417: { nuip: "9999123456" } }, reloj);
    expect(r.motivo).toBeNull();
    expect(r.omitidas).toContain("texto-visible");
    expect(detectarInconsistencia("amarilla", undefined, reloj).omitidas).toStrictEqual(["datos", "texto-visible"]);
  });

  it("FRA-11 NUIP con formato inválido (P7: sin rangos)", () => {
    expect(detectarInconsistencia("amarilla", { pdf417: { nuip: "12A45" } }, reloj).motivo?.detalle).toBe("nuip-formato");
    // Cualquier número de formato válido se acepta: no hay rangos por época.
    expect(detectarInconsistencia("amarilla", { pdf417: { nuip: "1000000001" } }, reloj).motivo).toBeNull();
  });

  it("FRA-11 los motivos fuertes prevalecen sobre los débiles", () => {
    const r = detectarInconsistencia(
      "amarilla",
      { pdf417: { nuip: "9999123456", codigoLugar: "99999" }, visible: { nuip: "9999123457" } },
      reloj,
    );
    expect(r.motivo?.detalle).toBe("municipio-inexistente");
  });

  it("FRA-11 MRZ ilegible se omite sin motivo", () => {
    const r = detectarInconsistencia("digital", { mrz: { lineas: ["basura"] }, visible: { nuip: "9999123456" } }, reloj);
    expect(r.motivo).toBeNull();
    expect(r.omitidas).toContain("mrz");
  });

  it("FRA-11 errores pasados: Ñ, RH AB+ y apellidos compuestos no producen inconsistencia", () => {
    const persona = { ...PERSONA_BASE, primerApellido: "MUÑOZ", segundoApellido: "DE LA PEÑA", rh: "AB+" as const };
    const fx = generarMrzTd1(persona);
    expect(detectarInconsistencia("digital", { mrz: { lineas: fx.lineas }, visible: { nuip: persona.nuip } }, reloj).motivo).toBeNull();
  });

  it("FRA-11 propiedad: MRZ válidas vigentes no producen fecha-imposible ni digito-control", () => {
    let utiles = 0;
    fc.assert(
      fc.property(arbFixtureMrz({ variantes: ["valida"] }), (fx) => {
        const r = detectarInconsistencia("digital", { mrz: { lineas: fx.lineas } }, () => new Date("2026-10-08T12:00:00Z"));
        if (r.motivo !== null) expect(r.motivo.detalle).toBe("vencido");
        else utiles++;
      }),
      { numRuns: 1000 },
    );
    expect(utiles).toBeGreaterThan(500);
  });

  it("FRA-11 propiedad: fechas válidas ordenadas nunca son imposibles", () => {
    const fecha = fc.date({ min: new Date("1900-01-01T00:00:00Z"), max: new Date("2026-10-08T00:00:00Z"), noInvalidDate: true });
    fc.assert(
      fc.property(fecha, fecha, (a, b) => {
        const [n, e] = a <= b ? [a, b] : [b, a];
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const r = detectarInconsistencia("amarilla", { pdf417: { fechaNacimiento: iso(n), fechaExpedicion: iso(e) } }, reloj);
        expect(r.motivo).toBeNull();
      }),
      { numRuns: 1000 },
    );
  });

  it("FRA-11 propiedad: nunca lanza", () => {
    fc.assert(fc.property(fc.anything(), fc.constantFrom("amarilla", "digital") as fc.Arbitrary<"amarilla" | "digital">, (d, t) => {
      detectarInconsistencia(t, d as never, reloj);
    }), { numRuns: 1000 });
  });
});

describe("FRA-18 vencimiento solo en la digital", () => {
  it("FRA-18 la amarilla nunca vence", () => {
    const r = detectarInconsistencia("amarilla", { pdf417: { fechaVencimiento: "2026-01-31" } }, reloj);
    expect(r.motivo).toBeNull();
  });

  it("FRA-18 la digital vence también con el campo explícito", () => {
    expect(detectarInconsistencia("digital", { visible: { fechaVencimiento: "2026-01-31" } }, reloj).motivo?.detalle).toBe("vencido");
    expect(detectarInconsistencia("digital", { visible: { fechaVencimiento: "2026-10-08" } }, reloj).motivo).toBeNull();
  });
});

describe("FRA-11 bordes (mutación)", () => {
  it("mes 13 y fechas con texto alrededor son imposibles", () => {
    for (const f of ["2001-13-01", "x2001-01-01", "2001-01-01x"]) expect(detectarInconsistencia("amarilla", { pdf417: { fechaNacimiento: f } }, reloj).motivo?.detalle, f).toBe("fecha-imposible");
    expect(detectarInconsistencia("amarilla", { pdf417: { fechaExpedicion: "2001-02-30" } }, reloj).motivo?.detalle).toBe("fecha-imposible");
    expect(detectarInconsistencia("amarilla", { pdf417: { fechaExpedicion: "2027-01-01" } }, reloj).motivo?.detalle).toBe("fecha-imposible");
  });

  it("campos no textuales se ignoran y sin MRZ no se omite nada más que lo visible", () => {
    expect(detectarInconsistencia("amarilla", { pdf417: { nuip: 12, fechaNacimiento: 5 }, visible: { nuip: "9999123456" } }, reloj)).toStrictEqual({ motivo: null, omitidas: [] });
  });

  it("visible ilegible o fuente ilegible no comparan", () => {
    expect(detectarInconsistencia("amarilla", { pdf417: { nuip: "9999123456" }, visible: { nuip: "ABC" } }, reloj).motivo?.detalle).toBe("nuip-formato");
    expect(detectarInconsistencia("amarilla", { pdf417: { nuip: "ABC" }, visible: { nuip: "9999123456" } }, reloj).motivo?.detalle).toBe("nuip-formato");
    expect(detectarInconsistencia("amarilla", { visible: { nuip: "9999123456" } }, reloj).motivo).toBeNull();
  });

  it("vencimiento ilegible o el mismo día no vence", () => {
    expect(detectarInconsistencia("digital", { visible: { fechaVencimiento: "nunca" } }, reloj).motivo?.detalle).toBe("fecha-imposible");
  });

  it("reloj que lanza o inválido: nada es futuro ni vencido", () => {
    const malo = () => {
      throw new Error("x");
    };
    expect(detectarInconsistencia("digital", { visible: { fechaVencimiento: "2001-01-01", fechaNacimiento: "2090-01-01" } }, malo).motivo).toBeNull();
    expect(detectarInconsistencia("digital", { mrz: { lineas: MRZ.lineas } }, () => new Date(Number.NaN)).motivo).toBeNull();
  });

  it("la MRZ aporta nacimiento y vencimiento", () => {
    const fx = generarMrzTd1({ ...PERSONA_BASE, fechaVencimiento: "2026-01-31" });
    const r = detectarInconsistencia("digital", { mrz: { lineas: fx.lineas }, visible: { fechaExpedicion: "1980-01-01" } }, reloj);
    expect(r.motivo?.detalle).toBe("vencido");
  });
});
