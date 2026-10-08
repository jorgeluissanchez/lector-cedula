// OFF-07 contrato de tipos (pwa-lectura-offline, tarea 2.2): el lector de códigos solo admite "pdf417".
// Se comprueba con `npx vitest run --typecheck.only packages/capture`.
import { describe, expectTypeOf, it } from "vitest";
import { crearLectorCodigosPdf417, type FormatoCodigo, type LectorCodigos } from "../../src/index.js";

describe("OFF-07 Nunca decodificar el QR (tipos)", () => {
  it("OFF-07 FormatoCodigo es solo pdf417", () => {
    expectTypeOf<FormatoCodigo>().toEqualTypeOf<"pdf417">();
    expectTypeOf(crearLectorCodigosPdf417).returns.toMatchTypeOf<LectorCodigos>();
    // @ts-expect-error: el QR de la cédula digital nunca se decodifica (principio V).
    const qr: FormatoCodigo = "qr";
    // @ts-expect-error: un LectorCodigos no puede declarar el formato "qr".
    const lector: LectorCodigos = { id: "x", formatos: ["qr"], leer: async () => [] };
    void qr;
    void lector;
  });
});
