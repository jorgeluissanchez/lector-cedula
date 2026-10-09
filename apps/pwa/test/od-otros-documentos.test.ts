// Cambio otros-documentos en la PWA (tareas 2.1, 6.2 y 6.3): pista TD1/TD3 en la secuencia y en el cliente del Worker
// lector (OD-20), etiquetas y campos por tipo de documento y errores nuevos (OD-23), parámetro de la TI hacia el Worker
// (OD-30a) y pantalla `autorizacion-representante` (OD-34b). Datos sintéticos (PASAPORTE_COL de OD-01, CE de OD-10a).
import type { PistaLectura, ResultadoLectura } from "@lector-cedula/capture";
import { describe, expect, it, vi } from "vitest";
import { ESTADO_INICIAL, reducir, requiereAutorizacion, type Estado, type LecturaCorrecta } from "../src/estado";
import { crearClienteLector, type PuertoLector } from "../src/lectura";
import { crearReintentos } from "../src/reintentos";
import { camposVisibles, ETIQUETAS_DOCUMENTO, tituloResultado } from "../src/resultado";
import { leerSecuencia, type FrameLectura } from "../src/secuencia";

const PASAPORTE: LecturaCorrecta = {
  ok: true,
  tipo: "mrz",
  intento: "original",
  resultado: {},
  tipoDocumento: "pasaporte",
  fuente: "mrz-td3",
  campos: {
    numeroDocumento: "AZ1234567",
    apellidos: "PEREZ NUNEZ",
    nombres: "ANA MARIA",
    fechaNacimiento: "1990-02-15",
    sexo: "F",
    nacionalidad: "COL",
    paisEmisor: "COL",
    fechaVencimiento: "2031-02-14",
  },
  warnings: [],
};

const CE: LecturaCorrecta = {
  ...PASAPORTE,
  tipoDocumento: "cedula-extranjeria",
  fuente: "mrz-td1",
  campos: { ...PASAPORTE.campos, numeroDocumento: "1234567", apellidos: "GARCIA", nombres: "MARIA JOSE", nacionalidad: "VEN", fechaNacimiento: "1980-01-01", fechaVencimiento: "2030-01-01" },
  warnings: ["CE01", "CE02", "CE03"],
};

const CAMPOS_AMARILLA = { numeroDocumento: "9999123456", primerApellido: "PRUEBA", segundoApellido: "EJEMPLO", primerNombre: "FICTICIA", segundoNombre: "LUZ", sexo: "F", fechaNacimiento: "1990-01-01", rh: "AB+" };
const AMARILLA: LecturaCorrecta = {
  ok: true,
  tipo: "pdf417",
  intento: "original",
  resultado: { campos: CAMPOS_AMARILLA },
  tipoDocumento: "cedula-ciudadania",
  fuente: "pdf417",
  campos: { numeroDocumento: "9999123456", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ", fechaNacimiento: "1990-01-01", sexo: "F", nacionalidad: "COL", paisEmisor: "COL", fechaVencimiento: null, nuip: "9999123456", rh: "AB+" },
  warnings: [],
};
const TI: LecturaCorrecta = { ...AMARILLA, tipoDocumento: "tarjeta-identidad", warnings: ["H10", "H12"] };
const DIGITAL: LecturaCorrecta = {
  ...AMARILLA,
  tipo: "mrz",
  fuente: "mrz-td1",
  resultado: { campos: { nuip: "9999123456", serial: "999912345", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ", sexo: "F", fechaNacimiento: "1990-01-01", fechaVencimiento: "2034-01-01", nacionalidad: "COL" } },
};

const valores = (l: LecturaCorrecta) => Object.fromEntries(camposVisibles(l).map((c) => [c.etiqueta, c.valor]));

describe("OD-23 Etiquetas y campos por documento", () => {
  it("OD-23 las cuatro etiquetas de la spec", () => {
    expect(ETIQUETAS_DOCUMENTO).toStrictEqual({
      "cedula-ciudadania": "Cédula de ciudadanía",
      "cedula-extranjeria": "Cédula de extranjería",
      pasaporte: "Pasaporte",
      "tarjeta-identidad": "Tarjeta de identidad",
    });
  });

  it("OD-23 título: documento y, en la cédula de ciudadanía, la variante amarilla o digital", () => {
    expect(tituloResultado(PASAPORTE)).toStrictEqual({ documento: "Pasaporte", variante: null });
    expect(tituloResultado(CE)).toStrictEqual({ documento: "Cédula de extranjería", variante: null });
    expect(tituloResultado(TI)).toStrictEqual({ documento: "Tarjeta de identidad", variante: null });
    expect(tituloResultado(AMARILLA)).toStrictEqual({ documento: "Cédula de ciudadanía", variante: "Cédula amarilla" });
    expect(tituloResultado(DIGITAL)).toStrictEqual({ documento: "Cédula de ciudadanía", variante: "Cédula digital" });
  });

  it("OD-22a pasaporte: campos comunes en orden, sin RH ni NUIP", () => {
    expect(camposVisibles(PASAPORTE).map((c) => [c.clave, c.etiqueta, c.valor])).toStrictEqual([
      ["numeroDocumento", "Número de documento", "AZ1234567"],
      ["apellidos", "Apellidos", "PEREZ NUNEZ"],
      ["nombres", "Nombres", "ANA MARIA"],
      ["sexo", "Sexo", "F"],
      ["fechaNacimiento", "Fecha de nacimiento", "1990-02-15"],
      ["fechaVencimiento", "Fecha de vencimiento", "2031-02-14"],
      ["nacionalidad", "Nacionalidad", "COL"],
      ["paisEmisor", "País emisor", "COL"],
    ]);
  });

  it("OD-12 CE: número tal cual y nacionalidad extranjera", () => {
    expect(valores(CE)).toMatchObject({ "Número de documento": "1234567", Nacionalidad: "VEN", "País emisor": "COL" });
  });

  it("OFF-09 sin cambios: amarilla y TI con los campos del PDF417 (RH incluido); digital con NUIP y serial", () => {
    expect(valores(AMARILLA)).toMatchObject({ "Número de documento": "9999123456", RH: "AB+", "Primer apellido": "PRUEBA" });
    expect(valores(TI)).toStrictEqual(valores(AMARILLA));
    expect(valores(DIGITAL)).toMatchObject({ "Número de documento": "9999123456", Serial: "999912345" });
  });

  it("campos de texto vacíos o nulos no se muestran", () => {
    const sinSexo: LecturaCorrecta = { ...PASAPORTE, campos: { ...PASAPORTE.campos, sexo: null, fechaVencimiento: null } };
    expect(camposVisibles(sinSexo).map((c) => c.clave)).not.toContain("sexo");
    expect(camposVisibles(sinSexo).map((c) => c.clave)).not.toContain("fechaVencimiento");
  });
});

describe("OD-23 Errores nuevos en la PWA", () => {
  const leyendo: Estado = { pantalla: "leyendo", aviso: null };
  it("OD-23 documento-no-admitido va a error-lectura con su código y no se reintenta", () => {
    const r: ResultadoLectura = { ok: false, tipo: "mrz", error: "documento-no-admitido", warnings: ["T01"] };
    expect(reducir(leyendo, { tipo: "leida", resultado: r })).toStrictEqual({ pantalla: "error-lectura", aviso: null, errorLectura: "documento-no-admitido" });
    const reintentos = crearReintentos(() => 0);
    reintentos.iniciar();
    expect(reintentos.decidir(r)).toBe("mostrar");
  });

  it("OD-32 ti-mayor-de-edad va a error-lectura y no se reintenta", () => {
    const r: ResultadoLectura = { ok: false, tipo: "pdf417", error: "ti-mayor-de-edad" };
    expect(reducir(leyendo, { tipo: "leida", resultado: r })).toMatchObject({ pantalla: "error-lectura", errorLectura: "ti-mayor-de-edad" });
    const reintentos = crearReintentos(() => 0);
    reintentos.iniciar();
    expect(reintentos.decidir(r)).toBe("mostrar");
  });
});

describe("OD-34b Pantalla autorizacion-representante", () => {
  const leyendo: Estado = { pantalla: "leyendo", aviso: null };
  const MENOR_PASAPORTE: LecturaCorrecta = { ...PASAPORTE, menorDeEdad: true };

  it("OD-34 requiere autorización: TI o menorDeEdad; nunca un adulto", () => {
    expect(requiereAutorizacion(TI)).toBe(true);
    expect(requiereAutorizacion(MENOR_PASAPORTE)).toBe(true);
    expect(requiereAutorizacion(PASAPORTE)).toBe(false);
    expect(requiereAutorizacion(AMARILLA)).toBe(false);
  });

  it("OD-34b una TI leída va a autorizacion-representante, no a resultado", () => {
    const e = reducir(leyendo, { tipo: "leida", resultado: TI, riesgo: null });
    expect(e).toStrictEqual({ pantalla: "autorizacion-representante", aviso: null, lectura: TI, riesgo: null });
  });

  it("OD-34b Continuar con la casilla: resultado con la misma lectura", () => {
    const e = reducir(reducir(leyendo, { tipo: "leida", resultado: MENOR_PASAPORTE }), { tipo: "autorizar" });
    expect(e).toStrictEqual({ pantalla: "resultado", aviso: null, lectura: MENOR_PASAPORTE });
  });

  it("OD-34b Cancelar: vuelve a inicio y los datos se descartan", () => {
    const e = reducir(reducir(leyendo, { tipo: "leida", resultado: TI }), { tipo: "cancelar" });
    expect(e).toStrictEqual(ESTADO_INICIAL);
    expect(JSON.stringify(e)).not.toContain("9999123456");
  });

  it("OD-34b página oculta en la autorización: inicio sin datos (OFF-11)", () => {
    expect(reducir(reducir(leyendo, { tipo: "leida", resultado: TI }), { tipo: "oculta" })).toStrictEqual(ESTADO_INICIAL);
  });

  it("autorizar fuera de la pantalla de autorización no cambia nada", () => {
    expect(reducir(leyendo, { tipo: "autorizar" })).toBe(leyendo);
    expect(reducir(ESTADO_INICIAL, { tipo: "autorizar" })).toBe(ESTADO_INICIAL);
  });

  it("un adulto sigue yendo directo a resultado", () => {
    expect(reducir(leyendo, { tipo: "leida", resultado: PASAPORTE })).toMatchObject({ pantalla: "resultado" });
  });
});

const frames = (n = 3): FrameLectura[] =>
  Array.from({ length: n }, (_, i) => ({ ancho: 2, alto: 1, pixeles: new Uint8ClampedArray(8).fill(i + 1), origen: "video" as const }));
const NO_MRZ: ResultadoLectura = { ok: false, tipo: "mrz", error: "mrz-no-encontrada" };

describe("OD-20 Pistas TD1 y TD3 en la secuencia de la PWA", () => {
  type Leer = (f: FrameLectura, lector: PistaLectura | null) => Promise<ResultadoLectura>;

  it("OD-20 pista mrz-td3: cada frame con TD3 y el respaldo final con TD1", async () => {
    const leer = vi.fn<Leer>(async () => NO_MRZ);
    await leerSecuencia(frames(), "mrz-td3", leer, { ahora: () => 0 });
    expect(leer.mock.calls.map((c) => c[1])).toStrictEqual(["mrz-td3", "mrz-td3", "mrz-td3", "mrz-td1"]);
  });

  it("OD-20 pista mrz-td3 leída en el primero: una sola lectura", async () => {
    const leer = vi.fn<Leer>(async () => PASAPORTE);
    expect((await leerSecuencia(frames(), "mrz-td3", leer, { ahora: () => 0 })).resultado).toBe(PASAPORTE);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("OD-20 pista mrz-td1: respaldo final pdf417, como la pista mrz", async () => {
    const leer = vi.fn<Leer>(async () => NO_MRZ);
    await leerSecuencia(frames(2), "mrz-td1", leer, { ahora: () => 0 });
    expect(leer.mock.calls.map((c) => c[1])).toStrictEqual(["mrz-td1", "mrz-td1", "pdf417"]);
  });
});

function puerto() {
  const enviados: Record<string, unknown>[] = [];
  const p: PuertoLector = {
    postMessage: (m: unknown) => void enviados.push(m as Record<string, unknown>),
    addEventListener: () => undefined,
    terminate: () => undefined,
  };
  return { p, enviados };
}

describe("OD-20 y OD-30a Mensaje al Worker lector", () => {
  const captura = { ancho: 2, alto: 1, pixeles: new Uint8ClampedArray(8) };

  it("OD-20 envía la pista mrz-td3 tal cual", () => {
    const { p, enviados } = puerto();
    void crearClienteLector(p).leer(captura, "2026-10-08", undefined, { pista: "mrz-td3", respaldo: false });
    expect(enviados[0]).toMatchObject({ pista: "mrz-td3", respaldo: false });
  });

  it("OD-30a con admitirTarjetaIdentidad envía true; sin ella no envía la clave", () => {
    const { p, enviados } = puerto();
    const c = crearClienteLector(p);
    void c.leer(captura, "2026-10-08", undefined, { admitirTarjetaIdentidad: true });
    void c.leer(captura, "2026-10-08", undefined, { admitirTarjetaIdentidad: false });
    void c.leer(captura, "2026-10-08");
    expect(enviados[0]).toMatchObject({ admitirTarjetaIdentidad: true });
    expect(enviados[1]).not.toHaveProperty("admitirTarjetaIdentidad");
    expect(enviados[2]).not.toHaveProperty("admitirTarjetaIdentidad");
  });
});
