// Contrato de tipos de CAL-14 y CAL-15 (design.md, decisión 7). Se comprueba con `npx vitest run --typecheck.only packages/capture`.
import { describe, expectTypeOf, it } from "vitest";
import type {
  CapturaAceptada,
  CodigoLeido,
  DeteccionDocumento,
  DetectorDocumento,
  FormatoCodigo,
  FrameAnalisis,
  LectorCodigos,
} from "../src/index.js";

describe("CAL-14 Interfaz de detector de documento", () => {
  it("CAL-14 Contrato de tipos", () => {
    class DetectorValido implements DetectorDocumento {
      readonly id = "prueba";
      detectar(frame: FrameAnalisis): DeteccionDocumento {
        return { cuadrilatero: null, confianza: frame.ancho > 0 ? 0.1 : null, fuente: "modelo" };
      }
    }
    class DetectorAsincrono implements DetectorDocumento {
      readonly id = "asincrono";
      detectar(frame: FrameAnalisis): Promise<DeteccionDocumento> {
        return Promise.resolve({ cuadrilatero: [[0, 0], [frame.ancho, 0], [frame.ancho, frame.alto], [0, frame.alto]], confianza: null, fuente: "guia" });
      }
      liberar(): void {}
    }
    expectTypeOf<DetectorValido>().toMatchTypeOf<DetectorDocumento>();
    expectTypeOf<DetectorAsincrono>().toMatchTypeOf<DetectorDocumento>();

    // @ts-expect-error una clase sin `detectar` no satisface la interfaz
    class DetectorSinDetectar implements DetectorDocumento {
      readonly id = "incompleto";
    }
    expectTypeOf<DetectorSinDetectar>().not.toMatchTypeOf<DetectorDocumento>();

    // @ts-expect-error la fuente solo admite "guia" o "modelo"
    const fuenteMala: DeteccionDocumento = { cuadrilatero: null, confianza: null, fuente: "otra" };
    void fuenteMala;
  });
});

describe("CAL-15 Interfaz de lector de códigos", () => {
  it("CAL-15 Contrato de tipos", () => {
    const lector: LectorCodigos = {
      id: "prueba",
      formatos: ["pdf417"],
      leer: (captura: CapturaAceptada): Promise<readonly CodigoLeido[]> =>
        Promise.resolve([{ formato: "pdf417", bytes: new Uint8Array([0x41]), esquinas: captura.cuadrilatero }]),
    };
    expectTypeOf(lector).toMatchTypeOf<LectorCodigos>();
    expectTypeOf<FormatoCodigo>().toEqualTypeOf<"pdf417">();
    expectTypeOf<CodigoLeido["bytes"]>().toEqualTypeOf<Uint8Array>();

    const lectorQr: LectorCodigos = {
      id: "qr",
      // @ts-expect-error el QR de la cédula digital no se decodifica (principio V)
      formatos: ["qr"],
      leer: () => Promise.resolve([]),
    };
    void lectorQr;

    const codigoQr: CodigoLeido = {
      // @ts-expect-error un código leído solo puede ser "pdf417"
      formato: "qr",
      bytes: new Uint8Array(),
      esquinas: null,
    };
    void codigoQr;
  });
});
