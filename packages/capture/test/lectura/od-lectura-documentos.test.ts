// Cambio otros-documentos, fase 2 (tareas 2.3 y 2.4): leerDocumento con salida unificada (OD-22, OD-22a), orden por
// pista (OD-20, OD-21), CE sin 2D (OD-13) y parámetro admitirTarjetaIdentidad con las reglas de edad (OD-30a a OD-33).
// Datos SINTÉTICOS: PERSONA_BASE de @lector-cedula/fixtures (con otras fechas) y las MRZ ICAO del generador de parsers
// (pasaporte COL de OD-01, CE de OD-10a). Lectores inyectados con espías; sin OCR.
import { PERSONA_BASE, generarMrzTd1, generarPdf417 } from "@lector-cedula/fixtures";
import { buscarDivipol, clasificarDocumento, parsearMrzCedulaDigital, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { describe, expect, it, vi } from "vitest";
import { crearManejadorLector } from "../../src/lectura/manejador.js";
import { leerDocumento } from "../../src/lectura/leer.js";
import type { DependenciasLectura, OpcionesLectura, ResultadoLectura } from "../../src/lectura/tipos.js";
import type { DocumentoMrz, ResultadoLectorMrz } from "../../src/mrz/lector.js";
import type { ResultadoPdf417Imagen } from "../../src/pdf417/decodificar.js";
import { CE_SINTETICA, DATOS_CE, DATOS_PASAPORTE_COL, generarTd1, generarTd3, PASAPORTE_COL } from "../../../parsers/test/ayudas/generador-mrz-icao.js";

const REF = "2026-10-08";
const PIXELES = { data: new Uint8ClampedArray(64).fill(255), width: 4, height: 4 };
const NO_PDF417: ResultadoPdf417Imagen = { ok: false, error: "pdf417-no-encontrado" };
const NO_MRZ: ResultadoLectorMrz = { ok: false, error: "mrz-no-encontrada" };

/** Bytes del PDF417 sintético de PERSONA_BASE con otra fecha de nacimiento y, si se da, otro prefijo `[0,2)`. */
function amarilla(fechaNacimiento = PERSONA_BASE.fechaNacimiento, prefijo?: string): Uint8Array {
  const b = new Uint8Array(generarPdf417({ ...PERSONA_BASE, fechaNacimiento }, { semilla: 1 }).bytes);
  if (prefijo !== undefined) b.set([prefijo.charCodeAt(0), prefijo.charCodeAt(1)], 0);
  return b;
}

function documento(lineas: string[]): DocumentoMrz {
  const d = clasificarDocumento(lineas, { fechaReferencia: REF });
  if (!d.ok || d.tipoDocumento === "cedula-ciudadania") throw new Error("fixture MRZ inválido");
  return d as DocumentoMrz;
}

const mrzDocumento = (lineas: string[]): ResultadoLectorMrz => ({ ok: true, intento: "franja", digitosValidos: lineas.length === 2 ? 5 : 4, documento: documento(lineas) });

function digital(fechaNacimiento = PERSONA_BASE.fechaNacimiento): ResultadoLectorMrz {
  const r = parsearMrzCedulaDigital(generarMrzTd1({ ...PERSONA_BASE, fechaNacimiento }, { semilla: 1 }).lineas, { fechaReferencia: REF });
  if (!r.ok) throw new Error("fixture MRZ inválido");
  return { ok: true, intento: "proyeccion", digitosValidos: 4, resultado: r };
}

/** Dependencias con espías: `pdf417` es la salida del decodificador; `mrz`, la del lector según el formato pedido. */
function deps(pdf417: ResultadoPdf417Imagen, mrz: { td1?: ResultadoLectorMrz; td3?: ResultadoLectorMrz } = {}) {
  const orden: string[] = [];
  const decodificar = vi.fn(async () => {
    orden.push("pdf417");
    return pdf417;
  });
  const leerMrz = vi.fn(async (_p: unknown, o?: unknown) => {
    const td3 = (o as { formato?: unknown } | undefined)?.formato === "td3";
    orden.push(td3 ? "td3" : "td1");
    return (td3 ? mrz.td3 : mrz.td1) ?? NO_MRZ;
  });
  const parsear = vi.fn(parsearPdf417Amarilla);
  const d: DependenciasLectura = { decodificar, lectorMrz: { leer: leerMrz }, parsearPdf417: parsear, buscarDivipol };
  return { d, orden, decodificar, leerMrz, parsear };
}

const pdf = (bytes: Uint8Array): ResultadoPdf417Imagen => ({ ok: true, bytes, intento: "original" });
const leer = (d: DependenciasLectura, o: Partial<OpcionesLectura> = {}): Promise<ResultadoLectura> =>
  leerDocumento(PIXELES, d, { fechaReferencia: REF, enmascarar: false, ...o });
const ON = { admitirTarjetaIdentidad: true } as const;

function exitoso(r: ResultadoLectura): Extract<ResultadoLectura, { ok: true }> {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("se esperaba éxito");
  return r;
}

describe("OD-20 Pista de formato: alias mrz", () => {
  it("OD-20 Alias mrz: pista mrz da lo mismo que mrz-td1", async () => {
    const a = deps(NO_PDF417, { td1: digital() });
    const b = deps(NO_PDF417, { td1: digital() });
    const ra = await leer(a.d, { pista: "mrz" });
    expect(ra).toStrictEqual(await leer(b.d, { pista: "mrz-td1" }));
    expect(exitoso(ra).tipoDocumento).toBe("cedula-ciudadania");
    expect(a.orden).toStrictEqual(["td1"]);
    expect(b.orden).toStrictEqual(["td1"]);
  });

  it("OD-20 el manejador del Worker acepta mrz-td1 y mrz-td3 como pistas; otro valor se ignora", async () => {
    for (const [pista, esperado] of [["mrz-td3", ["td3"]], ["mrz-td1", ["td1"]], ["mrz", ["td1"]], ["otra", ["pdf417", "td1"]]] as const) {
      const x = deps(NO_PDF417);
      const manejar = crearManejadorLector(x.d);
      await manejar({ tipo: "leer", id: 1, ancho: 1, alto: 1, pixeles: new ArrayBuffer(4), fechaReferencia: REF, pista, respaldo: false });
      expect(x.orden, pista).toStrictEqual(esperado);
    }
  });
});

describe("OD-21 Orden con pista TD3", () => {
  it("OD-21 Orden con pista TD3: TD3 no encontrada, TD1 da una CE; PDF417 no se llama", async () => {
    const x = deps(NO_PDF417, { td1: mrzDocumento(CE_SINTETICA) });
    const r = exitoso(await leer(x.d, { pista: "mrz-td3" }));
    expect(r.tipoDocumento).toBe("cedula-extranjeria");
    expect(r.fuente).toBe("mrz-td1");
    expect(x.orden).toStrictEqual(["td3", "td1"]);
    expect(x.leerMrz).toHaveBeenNthCalledWith(1, PIXELES, { fechaReferencia: REF, formato: "td3" });
    expect(x.leerMrz).toHaveBeenNthCalledWith(2, PIXELES, { fechaReferencia: REF });
    expect(x.decodificar).toHaveBeenCalledTimes(0);
  });

  it("OD-21 Con pista TD3 sin nada: TD3, TD1 y PDF417, y el error es el del último", async () => {
    const x = deps(NO_PDF417);
    expect(await leer(x.d, { pista: "mrz-td3" })).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" });
    expect(x.orden).toStrictEqual(["td3", "td1", "pdf417"]);
  });

  it("OD-21 Con pista TD3 y respaldo false solo se prueba TD3", async () => {
    const x = deps(NO_PDF417);
    expect(await leer(x.d, { pista: "mrz-td3", respaldo: false })).toStrictEqual({ ok: false, tipo: "mrz", error: "mrz-no-encontrada" });
    expect(x.orden).toStrictEqual(["td3"]);
  });

  it("OD-21 Sin pista no se busca TD3 (OFF-06 sin cambios)", async () => {
    const x = deps(NO_PDF417);
    await leer(x.d);
    expect(x.orden).toStrictEqual(["pdf417", "td1"]);
  });
});

describe("OD-22 y OD-22a Salida unificada", () => {
  it("OD-22a Amarilla unificada (PERSONA_BASE)", async () => {
    const r = exitoso(await leer(deps(pdf(amarilla())).d));
    expect(r.tipoDocumento).toBe("cedula-ciudadania");
    expect(r.fuente).toBe("pdf417");
    expect(r.tipo).toBe("pdf417");
    expect(r.campos.numeroDocumento).toBe(r.campos.nuip);
    expect(r.campos.numeroDocumento).toBe(PERSONA_BASE.nuip);
    expect(r.campos.nacionalidad).toBe("COL");
    expect(r.campos.paisEmisor).toBe("COL");
    expect(r.campos.fechaVencimiento).toBeNull();
    expect(r.campos.rh).toBe(PERSONA_BASE.rh);
    expect(r.campos.apellidos).toBe(`${PERSONA_BASE.primerApellido} ${PERSONA_BASE.segundoApellido}`);
    expect(r.campos.fechaNacimiento).toBe(PERSONA_BASE.fechaNacimiento);
    expect(r.campos).toHaveProperty("lugarNacimiento");
  });

  it("OD-22a Pasaporte unificado sin campos de cédula", async () => {
    const r = exitoso(await leer(deps(NO_PDF417, { td3: mrzDocumento(PASAPORTE_COL) }).d, { pista: "mrz-td3" }));
    expect(r.tipoDocumento).toBe("pasaporte");
    expect(r.fuente).toBe("mrz-td3");
    expect(r.tipo).toBe("mrz");
    expect(r.campos).toStrictEqual({
      numeroDocumento: "AZ1234567",
      apellidos: "PEREZ NUNEZ",
      nombres: "ANA MARIA",
      fechaNacimiento: "1990-02-15",
      sexo: "F",
      nacionalidad: "COL",
      paisEmisor: "COL",
      fechaVencimiento: "2031-02-14",
    });
    expect(r.campos).not.toHaveProperty("rh");
    expect(r.campos).not.toHaveProperty("nuip");
    expect(r).not.toHaveProperty("menorDeEdad");
  });

  it("OD-22a Digital unificada: NUIP como número, emisor COL y vencimiento", async () => {
    const r = exitoso(await leer(deps(NO_PDF417, { td1: digital() }).d));
    expect(r.tipoDocumento).toBe("cedula-ciudadania");
    expect(r.fuente).toBe("mrz-td1");
    expect(r.campos.numeroDocumento).toBe(PERSONA_BASE.nuip);
    expect(r.campos.nuip).toBe(PERSONA_BASE.nuip);
    expect(r.campos.paisEmisor).toBe("COL");
    expect(r.campos.fechaVencimiento).toBe(PERSONA_BASE.fechaVencimiento);
    expect(r.campos).not.toHaveProperty("rh");
  });

  it("OD-22 Por defecto los campos unificados van enmascarados (OFF-09)", async () => {
    const r = exitoso(await leerDocumento(PIXELES, deps(NO_PDF417, { td3: mrzDocumento(PASAPORTE_COL) }).d, { fechaReferencia: REF, pista: "mrz-td3" }));
    expect(r.campos.numeroDocumento).toBe("*******67");
    expect(r.campos.apellidos).toBe("P**** N****");
    expect(r.campos.nombres).toBe("A** M****");
    expect(JSON.stringify(r)).not.toContain("AZ1234567");
    const a = exitoso(await leerDocumento(PIXELES, deps(pdf(amarilla())).d, { fechaReferencia: REF }));
    expect(a.campos.nuip).toBe("********56");
    expect(JSON.stringify(a)).not.toContain(PERSONA_BASE.nuip);
  });
});

describe("OD-13 Código 2D de la CE no se decodifica", () => {
  it("OD-13 CE con 2D sintético y pista pdf417: el PDF417 no da campos y la CE sale de la MRZ", async () => {
    const aleatorios = Uint8Array.from({ length: 300 }, (_, i) => (i * 73 + 41) % 256);
    const x = deps(pdf(aleatorios), { td1: mrzDocumento(CE_SINTETICA) });
    const r = exitoso(await leer(x.d, { pista: "pdf417" }));
    expect(x.parsear).toHaveBeenCalledTimes(1);
    expect(x.parsear.mock.results[0]?.value).toMatchObject({ ok: false });
    expect(aleatorios.every((b) => b === 0)).toBe(true);
    expect(r.tipoDocumento).toBe("cedula-extranjeria");
    expect(r.fuente).toBe("mrz-td1");
    expect(r.campos).toStrictEqual({
      numeroDocumento: "1234567",
      apellidos: "GARCIA",
      nombres: "MARIA JOSE",
      fechaNacimiento: "1980-01-01",
      sexo: "F",
      nacionalidad: "VEN",
      paisEmisor: "COL",
      fechaVencimiento: "2030-01-01",
    });
  });

  it("OD-13 Si la MRZ no da una CE, se conserva pdf417-no-valido (una digital no sustituye al PDF417)", async () => {
    const malos = () => pdf(new Uint8Array([1, 2, 3]));
    expect(await leer(deps(malos(), { td1: digital() }).d, { pista: "pdf417" })).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-valido" });
    expect(await leer(deps(malos()).d, { pista: "pdf417" })).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-valido" });
    const sinRespaldo = deps(malos(), { td1: mrzDocumento(CE_SINTETICA) });
    expect(await leer(sinRespaldo.d, { pista: "pdf417", respaldo: false })).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-valido" });
    expect(sinRespaldo.orden).toStrictEqual(["pdf417"]);
    const sinPista = deps(malos(), { td1: mrzDocumento(CE_SINTETICA) });
    expect(await leer(sinPista.d)).toStrictEqual({ ok: false, tipo: "pdf417", error: "pdf417-no-valido" });
    expect(sinPista.orden).toStrictEqual(["pdf417"]);
  });

  it("OD-13 Cancelada durante el respaldo MRZ: cancelada", async () => {
    const control = new AbortController();
    const x = deps(pdf(new Uint8Array([1, 2, 3])));
    x.leerMrz.mockImplementation(async () => {
      control.abort();
      return mrzDocumento(CE_SINTETICA);
    });
    expect(await leer(x.d, { pista: "pdf417", senal: control.signal })).toStrictEqual({ ok: false, error: "cancelada" });
  });
});

const menorPdf = { ok: false, tipo: "pdf417", error: "menor-de-edad" } as const;
const menorMrz = { ok: false, tipo: "mrz", error: "menor-de-edad" } as const;

describe("OD-31 Parámetro apagado conserva OFF-24", () => {
  for (const [nombre, opcion] of [["ausente", {}], ["false", { admitirTarjetaIdentidad: false }]] as const) {
    it(`OD-31 Escenarios de OFF-24 sin cambios (opción ${nombre})`, async () => {
      expect(exitoso(await leer(deps(pdf(amarilla("2008-10-08"))).d, opcion)).tipoDocumento).toBe("cedula-ciudadania");
      expect(await leer(deps(pdf(amarilla("2008-10-09"))).d, opcion)).toStrictEqual(menorPdf);
      expect(await leer(deps(pdf(amarilla("2014-05-10", "I3"))).d, opcion)).toStrictEqual(menorPdf);
      // TI identificada por su prefijo: menor-de-edad aunque la fecha sea de un mayor (OD-31, OD-33).
      expect(await leer(deps(pdf(amarilla("1990-01-01", "I3"))).d, opcion)).toStrictEqual(menorPdf);
      expect(exitoso(await leer(deps(NO_PDF417, { td1: digital("2008-10-08") }).d, opcion)).tipoDocumento).toBe("cedula-ciudadania");
      expect(await leer(deps(NO_PDF417, { td1: digital("2008-10-09") }).d, opcion)).toStrictEqual(menorMrz);
      // 29 de febrero: cumple el 1 de marzo en años no bisiestos.
      const f = { fechaReferencia: "2026-02-28" };
      expect(await leer(deps(pdf(amarilla("2008-02-29"))).d, { ...opcion, ...f })).toStrictEqual(menorPdf);
      expect(exitoso(await leer(deps(pdf(amarilla("2008-02-29"))).d, { ...opcion, fechaReferencia: "2026-03-01" })).tipoDocumento).toBe("cedula-ciudadania");
    });
  }
});

describe("OD-32 OFF-24b Regla de edad con el parámetro encendido", () => {
  it("OD-32 Digital de un menor: menor-de-edad", async () => {
    expect(await leer(deps(NO_PDF417, { td1: digital("2010-01-01") }).d, ON)).toStrictEqual(menorMrz);
  });

  it("OD-32 TI de 12 años admitida (prefijo I3): H10 y H12", async () => {
    const r = exitoso(await leer(deps(pdf(amarilla("2014-05-10", "I3"))).d, ON));
    expect(r.tipoDocumento).toBe("tarjeta-identidad");
    expect(r.fuente).toBe("pdf417");
    expect(r.warnings).toContain("H10");
    expect(r.warnings).toContain("H12");
  });

  it("OD-32 Frontera de 18 años", async () => {
    expect(exitoso(await leer(deps(pdf(amarilla("2008-10-09", "I3"))).d, ON)).tipoDocumento).toBe("tarjeta-identidad");
    expect(await leer(deps(pdf(amarilla("2008-10-08", "I3"))).d, ON)).toStrictEqual({ ok: false, tipo: "pdf417", error: "ti-mayor-de-edad" });
  });

  it("OD-32 (c) PDF417 sin marca de TI de un mayor: cédula de ciudadanía sin hipótesis de TI", async () => {
    const r = exitoso(await leer(deps(pdf(amarilla("2008-10-08"))).d, ON));
    expect(r.tipoDocumento).toBe("cedula-ciudadania");
    expect(r.warnings).not.toContain("H10");
  });
});

describe("OD-32b Menores de 7 años", () => {
  it("OD-32b Frontera de 7 años", async () => {
    expect(await leer(deps(pdf(amarilla("2019-10-09", "I3"))).d, ON)).toStrictEqual({ ok: false, tipo: "pdf417", error: "documento-no-admitido" });
    expect(exitoso(await leer(deps(pdf(amarilla("2019-10-08", "I3"))).d, ON)).tipoDocumento).toBe("tarjeta-identidad");
  });

  it("OD-32b Pasaporte de un menor de 7 años con el parámetro encendido: documento-no-admitido", async () => {
    const td3 = mrzDocumento(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "200101" }));
    expect(await leer(deps(NO_PDF417, { td3 }).d, { ...ON, pista: "mrz-td3" })).toStrictEqual({ ok: false, tipo: "mrz", error: "documento-no-admitido" });
  });
});

describe("OD-32a CE y pasaporte de menores", () => {
  const pasaporte10 = () => mrzDocumento(generarTd3({ ...DATOS_PASAPORTE_COL, nacimiento: "160101" }));
  const ce10 = () => mrzDocumento(generarTd1({ ...DATOS_CE, nacimiento: "160101" }));

  it("OD-32a Pasaporte de un menor", async () => {
    expect(await leer(deps(NO_PDF417, { td3: pasaporte10() }).d, { pista: "mrz-td3" })).toStrictEqual(menorMrz);
    const r = exitoso(await leer(deps(NO_PDF417, { td3: pasaporte10() }).d, { ...ON, pista: "mrz-td3" }));
    expect(r.tipoDocumento).toBe("pasaporte");
    expect(r.menorDeEdad).toBe(true);
  });

  it("OD-32a CE de un menor", async () => {
    expect(await leer(deps(NO_PDF417, { td1: ce10() }).d)).toStrictEqual(menorMrz);
    const r = exitoso(await leer(deps(NO_PDF417, { td1: ce10() }).d, ON));
    expect(r.tipoDocumento).toBe("cedula-extranjeria");
    expect(r.menorDeEdad).toBe(true);
  });
});

describe("OD-33 Identificación de la TI (hipótesis)", () => {
  it("OD-33 Prefijo 03 de un menor: TI por edad, H10 sin H12", async () => {
    const r = exitoso(await leer(deps(pdf(amarilla("2011-01-01", "03"))).d, ON));
    expect(r.tipoDocumento).toBe("tarjeta-identidad");
    expect(r.warnings).toContain("H10");
    expect(r.warnings).not.toContain("H12");
  });

  it("OD-33 TD1 IT sintético: documento-no-admitido con T01, con el parámetro encendido o apagado", async () => {
    const td1: ResultadoLectorMrz = { ok: false, error: "documento-no-admitido", warnings: ["T01"] };
    for (const o of [ON, {}]) {
      const r = await leer(deps(NO_PDF417, { td1 }).d, o);
      expect(r).toStrictEqual({ ok: false, tipo: "mrz", error: "documento-no-admitido", warnings: ["T01"] });
    }
  });

  it("OD-30a El manejador pasa admitirTarjetaIdentidad solo si es true", async () => {
    const bytes = () => amarilla("2014-05-10", "I3");
    const msg = (admitirTarjetaIdentidad: unknown) => ({ tipo: "leer", id: 1, ancho: 1, alto: 1, pixeles: new ArrayBuffer(4), fechaReferencia: REF, admitirTarjetaIdentidad });
    const on = await crearManejadorLector(deps(pdf(bytes())).d)(msg(true));
    expect(on?.resultado).toMatchObject({ ok: true, tipoDocumento: "tarjeta-identidad" });
    const otro = await crearManejadorLector(deps(pdf(bytes())).d)(msg("true"));
    expect(otro?.resultado).toStrictEqual(menorPdf);
  });
});
