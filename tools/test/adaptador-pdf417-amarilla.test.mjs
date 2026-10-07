// fixture-sintetico: pruebas del adaptador de evals del parser PDF417 (cambio parser-pdf417-amarilla, decisión 15).
// Tramas ficticias del generador @lector-cedula/fixtures (NUIP 9999...).
import { PERSONA_BASE, generarPdf417 } from "@lector-cedula/fixtures";
import { describe, expect, it } from "vitest";
import { evaluarPdf417AmarillaHex } from "../../evals/runners/adaptadores/pdf417-amarilla.mjs";

const hexDe = (bytes) => Buffer.from(bytes).toString("hex");
const BASE = generarPdf417(PERSONA_BASE, { variante: "completa", semilla: 1 });

describe("Adaptador de evals pdf417-amarilla", () => {
  it("hex inválido lanza con 'hex' en el mensaje (atrapa: aceptar entradas no hexadecimales)", () => {
    for (const malo of ["0", "zz", "0A", "0g", " 00", "00 ", 5, null, undefined, ["00"]]) {
      expect(() => evaluarPdf417AmarillaHex(malo)).toThrow(/hex/);
    }
  });

  it("hex vacío llega al parser como entrada vacía (atrapa: tratar '' como error del adaptador)", () => {
    expect(evaluarPdf417AmarillaHex("")).toStrictEqual({ ok: false, error: "entrada-vacia" });
  });

  it("éxito aplanado con claves exactas (atrapa: perder campos, trama o warnings)", () => {
    expect(evaluarPdf417AmarillaHex(hexDe(BASE.bytes))).toStrictEqual({
      ok: true,
      numeroDocumento: "9999123456",
      primerApellido: "PRUEBA",
      segundoApellido: "EJEMPLO",
      primerNombre: "FICTICIA",
      segundoNombre: "LUZ",
      sexo: "F",
      fechaNacimiento: "1985-03-14",
      rh: "O+",
      codigoDepartamentoNacimiento: "16",
      codigoMunicipioNacimiento: "001",
      variante: "completa",
      modo: "offsets",
      bloqueDemografico: "sexo-primero",
      warnings: [],
    });
  });

  it("los bytes del hex se respetan uno a uno (atrapa: decodificar como texto)", () => {
    const w = generarPdf417(PERSONA_BASE, { variante: "windows-truncada", semilla: 1 });
    const r = evaluarPdf417AmarillaHex(hexDe(w.bytes));
    expect([r.variante, r.modo, r.warnings]).toStrictEqual(["truncada", "patrones", ["H02"]]);
  });

  it("error con claves ok y error (atrapa: claves extra en el error)", () => {
    const bytes = Uint8Array.from(BASE.bytes);
    bytes.fill(0x30, 48, 58);
    expect(evaluarPdf417AmarillaHex(hexDe(bytes))).toStrictEqual({ ok: false, error: "nuip-invalido" });
  });

  it("las opciones se pasan al parser (atrapa: ignorar opciones del fixture)", () => {
    expect(evaluarPdf417AmarillaHex(hexDe(BASE.bytes), 5)).toStrictEqual({ ok: false, error: "opciones-invalidas" });
    expect(evaluarPdf417AmarillaHex(hexDe(BASE.bytes), {}).ok).toBe(true);
  });
});
