// MOT-09: entrada que recibe @lector-cedula/fraud en el servidor (imagen completa como único frame, cuadrilátero de la
// imagen, aproximado, reverso) y qué documentos producen señal: la cédula amarilla (PDF417), la digital (MRZ TD1) y la
// tarjeta de identidad leída por PDF417 o MRZ; otros documentos dan `riesgo: null` sin invocar el análisis.
// Datos SINTÉTICOS: PERSONA_BASE (NUIP 9999123456) de @lector-cedula/fixtures. El PDF417 se lee de una imagen real
// generada en memoria; la MRZ se inyecta con un lector falso que devuelve la salida del parser (sin OCR).
import { decodificarPixeles, type LectorMrz, type ResultadoLectorMrz } from "@lector-cedula/capture";
import { generarMrzTd1, generarPdf417, PERSONA_BASE } from "@lector-cedula/fixtures";
import type { EntradaFraude } from "@lector-cedula/fraud";
import { clasificarDocumento, parsearMrzCedulaDigital } from "@lector-cedula/parsers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { imagenSintetica } from "../../capture/test/pdf417/sintetica.js";
import { CE_SINTETICA, PASAPORTE_COL } from "../../parsers/test/ayudas/generador-mrz-icao.js";
import { entradaFraude, leerImagen, type OpcionesLeer } from "../src/leer.js";
import { amarilla, NUIP, sinDocumento } from "./ayudas/imagenes.js";

/** Copia de cada entrada recibida por evaluarFraude (los píxeles se ponen a cero al terminar la lectura, MOT-07). */
const recibidas: { entrada: EntradaFraude; pixeles: Uint8ClampedArray[] }[] = [];

vi.mock("@lector-cedula/fraud", async (importOriginal) => {
  const real = await importOriginal<typeof import("@lector-cedula/fraud")>();
  return {
    ...real,
    evaluarFraude: vi.fn((entrada: EntradaFraude) => {
      recibidas.push({ entrada, pixeles: entrada.frames.map((f) => new Uint8ClampedArray(f.data)) });
      return real.evaluarFraude(entrada);
    }),
  };
});

const FECHA = "2026-10-10";
const OPCIONES: OpcionesLeer = { fechaReferencia: FECHA, admitirTarjetaIdentidad: false, fraude: true };

/** Lector MRZ que falla si se llama: con PDF417 legible la MRZ no se intenta. */
const SIN_MRZ: Pick<LectorMrz, "leer"> = {
  leer: () => Promise.reject(new Error("la MRZ no debía leerse")),
};

const lectorFijo = (r: ResultadoLectorMrz): Pick<LectorMrz, "leer"> => ({ leer: () => Promise.resolve(r) });

function documentoMrz(lineas: string[]): ResultadoLectorMrz {
  const d = clasificarDocumento(lineas, { fechaReferencia: FECHA });
  if (!d.ok || d.tipoDocumento === "cedula-ciudadania") throw new Error("fixture MRZ inválido");
  return { ok: true, intento: "franja", digitosValidos: lineas.length === 2 ? 5 : 4, documento: d } as ResultadoLectorMrz;
}

/** La única entrada recibida por evaluarFraude. */
function unica(): { entrada: EntradaFraude; pixeles: Uint8ClampedArray[] } {
  expect(recibidas).toHaveLength(1);
  const r = recibidas[0];
  if (r === undefined) throw new Error("evaluarFraude no se invocó");
  return r;
}

function esquinas(w: number, h: number): EntradaFraude["cuadrilatero"] {
  return [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }];
}

/** Comprueba la parte común de la entrada: un único frame con la imagen completa decodificada de `bytes`. */
async function comprobarImagenCompleta(bytes: Uint8Array): Promise<void> {
  const esperada = await decodificarPixeles(bytes);
  if (esperada === null) throw new Error("fixture ilegible");
  const { entrada, pixeles } = unica();
  expect(entrada.frames.map((f) => [f.width, f.height])).toStrictEqual([[esperada.width, esperada.height]]);
  expect(pixeles[0]).toStrictEqual(esperada.data);
  expect(entrada.cuadrilatero).toStrictEqual(esquinas(esperada.width, esperada.height));
  expect(entrada.cuadrilateroAproximado).toBe(true);
  expect(entrada.cara).toBe("reverso");
  expect(entrada.reloj()).toBeInstanceOf(Date);
}

describe("MOT-09 entrada del fraude en el motor", { timeout: 120_000 }, () => {
  beforeEach(() => {
    recibidas.length = 0;
  });

  it("MOT-09 Entrada del fraude para la amarilla", async () => {
    const bytes = await amarilla();
    const r = await leerImagen(bytes, SIN_MRZ, OPCIONES);
    expect(r).toMatchObject({ ok: true, fuente: "pdf417", tipoDocumento: "cedula-ciudadania" });
    await comprobarImagenCompleta(bytes);
    const { entrada } = unica();
    expect(entrada.tipo).toBe("amarilla");
    expect(entrada.datos).toStrictEqual({
      pdf417: { nuip: "9999123456", fechaNacimiento: PERSONA_BASE.fechaNacimiento, codigoLugar: `${PERSONA_BASE.departamento}${PERSONA_BASE.municipio}` },
    });
    expect(entrada.datos?.pdf417?.codigoLugar).toBe("16001");
    expect(r.riesgo).not.toBeNull();
  });

  it("MOT-09 Entrada del fraude para la digital", async () => {
    const lineas = generarMrzTd1(PERSONA_BASE, { semilla: 1 }).lineas;
    const parseada = parsearMrzCedulaDigital(lineas, { fechaReferencia: FECHA });
    if (!parseada.ok) throw new Error("fixture MRZ inválido");
    const bytes = sinDocumento();
    const r = await leerImagen(bytes, lectorFijo({ ok: true, intento: "proyeccion", digitosValidos: 4, resultado: parseada }), OPCIONES);
    expect(r).toMatchObject({ ok: true, fuente: "mrz-td1", tipoDocumento: "cedula-ciudadania", campos: { nuip: NUIP } });
    await comprobarImagenCompleta(bytes);
    const { entrada } = unica();
    expect(entrada.tipo).toBe("digital");
    expect(entrada.datos).toStrictEqual({ mrz: { lineas: parseada.lineasCorregidas } });
    expect(parseada.lineasCorregidas).toStrictEqual(lineas);
    expect(r.riesgo).not.toBeNull();
  });

  it("MOT-09 Tarjeta de identidad con señal (PDF417)", async () => {
    const persona = { ...PERSONA_BASE, fechaNacimiento: "2014-05-10" };
    const bytes = await imagenSintetica(generarPdf417(persona, { semilla: 1 }).bytes);
    const r = await leerImagen(bytes, SIN_MRZ, { ...OPCIONES, admitirTarjetaIdentidad: true });
    expect(r).toMatchObject({ ok: true, fuente: "pdf417", tipoDocumento: "tarjeta-identidad" });
    await comprobarImagenCompleta(bytes);
    const { entrada } = unica();
    expect(entrada.tipo).toBe("amarilla");
    expect(entrada.datos).toStrictEqual({ pdf417: { nuip: NUIP, fechaNacimiento: "2014-05-10", codigoLugar: "16001" } });
    expect(r.riesgo).not.toBeNull();
  });

  it("MOT-09 Tarjeta de identidad con señal (MRZ TD1)", () => {
    const lineas = ["I<COL9999123456<0<<<<<<<<<<<<<<", "1405102F3503146COL<<<<<<<<<<<0", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<<"];
    const pixeles = { data: new Uint8ClampedArray(4 * 6 * 4), width: 6, height: 4 };
    const lectura = {
      ok: true,
      tipo: "mrz",
      intento: "franja",
      resultado: { lineasCorregidas: lineas },
      tipoDocumento: "tarjeta-identidad",
      fuente: "mrz-td1",
      campos: { numeroDocumento: NUIP, nuip: NUIP, apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ", fechaNacimiento: "2014-05-10", sexo: "F", nacionalidad: "COL", paisEmisor: "COL", fechaVencimiento: null },
      warnings: [],
    } as const;
    const entrada = entradaFraude(lectura, pixeles);
    expect(entrada).toStrictEqual({
      frames: [pixeles],
      cuadrilatero: esquinas(6, 4),
      cuadrilateroAproximado: true,
      cara: "reverso",
      reloj: expect.any(Function),
      tipo: "digital",
      datos: { mrz: { lineas } },
    });
  });

  it.each([
    ["pasaporte", PASAPORTE_COL],
    ["cedula-extranjeria", CE_SINTETICA],
  ])("MOT-09 Otros documentos sin señal: %s", async (tipo, lineas) => {
    const r = await leerImagen(sinDocumento(), lectorFijo(documentoMrz([...lineas])), OPCIONES);
    expect(r).toMatchObject({ ok: true, tipoDocumento: tipo, riesgo: null });
    expect(recibidas).toHaveLength(0);
  });

  it("MOT-09 fraude: false no invoca el análisis", async () => {
    const r = await leerImagen(await amarilla(), SIN_MRZ, { ...OPCIONES, fraude: false });
    expect(r).toMatchObject({ ok: true, fuente: "pdf417", riesgo: null });
    expect(recibidas).toHaveLength(0);
  });
});
