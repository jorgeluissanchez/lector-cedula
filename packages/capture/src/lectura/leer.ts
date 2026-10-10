// Orquestación pura de la lectura (OFF-06, OFF-08, OFF-27; design.md, decisión 2; otros-documentos OD-13, OD-20 a
// OD-22a y OD-30a a OD-33). Sin pista, el mismo orden que tools/leer-foto.mjs: primero PDF417; solo si el error es
// `pdf417-no-encontrado`, la MRZ TD1 con el plan de giros. Con `pista` (el contenido que vio la presencia, OFF-27, OD-20)
// empieza por ese lector y prueba los demás solo como respaldo cuando el primero no encuentra nada (y `respaldo` no es
// `false`): `"mrz-td3"` -> TD3, TD1, PDF417; `"mrz"`/`"mrz-td1"` -> TD1, PDF417; `"pdf417"` -> PDF417, TD1. El éxito lleva
// la salida unificada (`tipoDocumento`, `fuente`, `campos`, `warnings`) y conserva un ciclo `tipo` y `resultado` (OD-22).
// Devuelve el resultado enmascarado salvo con `enmascarar: false` (OFF-09; la PWA muestra los datos completos) y pone a
// cero los bytes del PDF417 tras parsearlos (OFF-11). La autorización del representante (OD-34) la pide quien muestra
// el resultado: aquí solo se marca `tipoDocumento: "tarjeta-identidad"` o `menorDeEdad: true`.
import type { CamposCedulaAmarilla } from "@lector-cedula/parsers";
import type { DocumentoMrz, ResultadoLectorMrz, ResultadoParserMrz } from "../mrz/lector.js";
import type { Pixeles } from "../pdf417/decodificar.js";
import { cumplioAnios, EDAD_MINIMA_TI, esMayorDeEdad } from "./edad.js";
import { conLugarNacimiento } from "./lugar.js";
import { enmascararCamposPdf417, enmascararNombre, enmascararResultadoMrz, enmascararUltimos2 } from "./mascara.js";
import type {
  CamposDocumento,
  DependenciasLectura,
  FuenteLectura,
  LugarNacimiento,
  OpcionesLectura,
  ResultadoLectura,
  TipoDocumento,
} from "./tipos.js";

/** OFF-27c: llamadas OCR del respaldo MRZ tras una pista PDF417 (la presencia no vio MRZ; solo TD1, nunca TD3). */
export const MAX_LLAMADAS_RESPALDO_MRZ = 4;

const CANCELADA: ResultadoLectura = { ok: false, error: "cancelada" };
const COLOMBIA = "COL";
/** OD-33: prefijo `I3` (bytes 0x49 0x33) de la TI en el PDF417 (hipótesis H12). */
const PREFIJO_TI = [0x49, 0x33] as const;

/** Función aparte: la señal puede abortarse durante un `await` (TypeScript estrecharía `aborted` a `false`). */
function abortada(senal: AbortSignal | undefined): boolean {
  return senal?.aborted === true;
}

/**
 * Resultado de un lector: `final` termina la lectura; `noEncontrado` permite probar el siguiente; `soloCe` (OD-13) es
 * un PDF417 no válido que solo cede ante una CE leída por MRZ.
 */
export type Paso =
  | { readonly final: ResultadoLectura }
  | { readonly noEncontrado: ResultadoLectura }
  | { readonly soloCe: ResultadoLectura };

type Lector = "pdf417" | "mrz-td1" | "mrz-td3";

const unir = (...partes: (string | null)[]): string => partes.filter((p): p is string => p !== null && p !== "").join(" ");

function enmascararCampos(c: CamposDocumento): CamposDocumento {
  return {
    ...c,
    numeroDocumento: enmascararUltimos2(c.numeroDocumento),
    apellidos: enmascararNombre(c.apellidos),
    nombres: enmascararNombre(c.nombres),
    ...("nuip" in c ? { nuip: enmascararUltimos2(c.nuip) } : {}),
  };
}

function exito(
  base: { tipo: "pdf417" | "mrz"; intento: string; resultado: unknown; tipoDocumento: TipoDocumento; fuente: FuenteLectura; warnings: readonly string[] },
  campos: CamposDocumento,
  opciones: OpcionesLectura,
  menorDeEdad = false,
): ResultadoLectura {
  const enmascarar = opciones.enmascarar ?? true;
  return { ok: true, ...base, campos: enmascarar ? enmascararCampos(campos) : campos, ...(menorDeEdad ? { menorDeEdad: true as const } : {}) };
}

function camposAmarilla(c: CamposCedulaAmarilla & { readonly lugarNacimiento: LugarNacimiento | null }): CamposDocumento {
  return {
    numeroDocumento: c.numeroDocumento,
    apellidos: unir(c.primerApellido, c.segundoApellido),
    nombres: unir(c.primerNombre, c.segundoNombre),
    fechaNacimiento: c.fechaNacimiento,
    sexo: c.sexo,
    nacionalidad: COLOMBIA,
    paisEmisor: COLOMBIA,
    fechaVencimiento: null,
    nuip: c.numeroDocumento,
    rh: c.rh,
    lugarNacimiento: c.lugarNacimiento,
  };
}

function camposDigital(r: ResultadoParserMrz): CamposDocumento {
  const c = r.campos;
  return {
    numeroDocumento: c.nuip,
    apellidos: c.apellidos,
    nombres: c.nombres,
    fechaNacimiento: c.fechaNacimiento,
    sexo: c.sexo,
    nacionalidad: c.nacionalidad,
    paisEmisor: COLOMBIA,
    fechaVencimiento: c.fechaVencimiento,
    nuip: c.nuip,
  };
}

function camposIcao(d: DocumentoMrz): CamposDocumento {
  const c = d.campos;
  return {
    numeroDocumento: c.numeroDocumento,
    apellidos: c.apellidos,
    nombres: c.nombres,
    fechaNacimiento: c.fechaNacimiento,
    sexo: c.sexo,
    nacionalidad: c.nacionalidad,
    paisEmisor: c.estadoEmisor,
    fechaVencimiento: c.fechaVencimiento,
  };
}

/** Resultado obsoleto (`resultado`) de una CE o un pasaporte, con la misma máscara que `campos`. */
function documentoEnmascarado(d: DocumentoMrz, enmascarar: boolean): DocumentoMrz {
  if (!enmascarar) return d;
  const c = d.campos;
  return { ...d, campos: { ...c, numeroDocumento: enmascararUltimos2(c.numeroDocumento), apellidos: enmascararNombre(c.apellidos), nombres: enmascararNombre(c.nombres) } } as DocumentoMrz;
}

async function pasoPdf417(pixeles: Pixeles, deps: DependenciasLectura, opciones: OpcionesLectura): Promise<Paso> {
  const { senal } = opciones;
  const imagen = await deps.decodificar(pixeles);
  if (abortada(senal)) {
    if (imagen.ok) imagen.bytes.fill(0);
    return { final: CANCELADA };
  }
  if (!imagen.ok) {
    if (imagen.error === "pdf417-no-encontrado") return { noEncontrado: { ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" } };
    return { final: { ok: false, error: imagen.error } };
  }
  return interpretarPdf417(imagen.bytes, imagen.intento, deps, opciones);
}

/** Dependencias síncronas de la interpretación, sin imagen (sdk-nativo, NAT-07). */
export type DependenciasInterpretacion = Pick<DependenciasLectura, "parsearPdf417" | "buscarDivipol">;

/**
 * Interpreta los bytes ya decodificados de un PDF417 (edad, TI, lugar y máscara) y los pone a cero, también ante
 * excepción. Síncrona y sin imagen: la comparten `leerDocumento` y el bundle `nucleo-js` (sdk-nativo, NAT-07).
 */
export function interpretarPdf417(bytes: Uint8Array, intento: string, deps: DependenciasInterpretacion, opciones: OpcionesLectura): Paso {
  const { fechaReferencia, enmascarar = true } = opciones;
  const admitirTi = opciones.admitirTarjetaIdentidad === true;
  const prefijoTi = bytes[0] === PREFIJO_TI[0] && bytes[1] === PREFIJO_TI[1];
  let resultado: ReturnType<DependenciasLectura["parsearPdf417"]>;
  try {
    resultado = deps.parsearPdf417(bytes, { divipol: deps.buscarDivipol });
  } finally {
    bytes.fill(0);
  }
  if (!resultado.ok) {
    const r: ResultadoLectura = { ok: false, tipo: "pdf417", error: "pdf417-no-valido" };
    // OD-13: con pista PDF417, el código 2D de una CE no se interpreta; solo la MRZ de una CE puede sustituirlo.
    return opciones.pista === "pdf417" && opciones.respaldo !== false ? { soloCe: r } : { final: r };
  }
  const nacimiento = resultado.campos.fechaNacimiento;
  const mayor = esMayorDeEdad(nacimiento, fechaReferencia);
  const rechazo = (error: "menor-de-edad" | "ti-mayor-de-edad" | "documento-no-admitido"): Paso => ({ final: { ok: false, tipo: "pdf417", error } });
  let tipoDocumento: TipoDocumento = "cedula-ciudadania";
  const hipotesis: string[] = [];
  if (!admitirTi) {
    // OD-31: con el parámetro apagado, OFF-24 sin cambios; una TI identificada por su prefijo también es menor-de-edad.
    if (!mayor || prefijoTi) return rechazo("menor-de-edad");
  } else if (prefijoTi && mayor) {
    return rechazo("ti-mayor-de-edad");
  } else if (!mayor) {
    // OD-32b: por debajo de 7 años el documento es el registro civil.
    if (!cumplioAnios(nacimiento, fechaReferencia, EDAD_MINIMA_TI)) return rechazo("documento-no-admitido");
    // OD-32 (a) y OD-33: TI por edad (H10) y, con prefijo I3, por la marca (H12).
    tipoDocumento = "tarjeta-identidad";
    hipotesis.push("H10", ...(prefijoTi ? ["H12"] : []));
  }
  const conLugar = conLugarNacimiento(resultado, deps.buscarDivipol);
  return {
    final: exito(
      {
        tipo: "pdf417",
        intento,
        resultado: enmascarar ? { ...conLugar, campos: enmascararCamposPdf417(conLugar.campos) } : conLugar,
        tipoDocumento,
        fuente: "pdf417",
        warnings: [...conLugar.warnings, ...hipotesis],
      },
      camposAmarilla(conLugar.campos),
      opciones,
    ),
  };
}

function pasoMrz(formato: "td1" | "td3") {
  return async (pixeles: Pixeles, deps: DependenciasLectura, opciones: OpcionesLectura, respaldoPdf417: boolean): Promise<Paso> => {
    const { senal, fechaReferencia } = opciones;
    const lectura = await deps.lectorMrz.leer(
      pixeles,
      formato === "td3" ? { fechaReferencia, formato } : respaldoPdf417 ? { fechaReferencia, maxLlamadasOcr: MAX_LLAMADAS_RESPALDO_MRZ } : { fechaReferencia },
    );
    if (abortada(senal)) return { final: CANCELADA };
    return interpretarMrz(lectura, opciones);
  };
}

/**
 * Interpreta la salida del lector MRZ (CE, pasaporte o cédula digital: edad y máscara). Síncrona y sin imagen: la
 * comparten `leerDocumento` y el bundle `nucleo-js`, que recibe las líneas ya leídas por el OCR nativo (NAT-07).
 */
export function interpretarMrz(lectura: ResultadoLectorMrz, opciones: OpcionesLectura): Paso {
  const { fechaReferencia, enmascarar = true } = opciones;
  if (!lectura.ok) {
    if (lectura.error === "documento-no-admitido")
      return { final: { ok: false, tipo: "mrz", error: lectura.error, ...("warnings" in lectura ? { warnings: lectura.warnings } : {}) } };
    const r: ResultadoLectura = { ok: false, tipo: "mrz", error: lectura.error };
    return lectura.error === "mrz-no-encontrada" ? { noEncontrado: r } : { final: r };
  }
  const menor: ResultadoLectura = { ok: false, tipo: "mrz", error: "menor-de-edad" };
  if ("documento" in lectura) {
    // OD-32a y OD-32b: CE o pasaporte; un menor solo con el parámetro encendido (y nunca por debajo de 7 años).
    const d = lectura.documento;
    const nacimiento = d.campos.fechaNacimiento;
    const esMenor = !esMayorDeEdad(nacimiento, fechaReferencia);
    if (esMenor && opciones.admitirTarjetaIdentidad !== true) return { final: menor };
    if (esMenor && !cumplioAnios(nacimiento, fechaReferencia, EDAD_MINIMA_TI))
      return { final: { ok: false, tipo: "mrz", error: "documento-no-admitido" } };
    return {
      final: exito(
        { tipo: "mrz", intento: lectura.intento, resultado: documentoEnmascarado(d, enmascarar), tipoDocumento: d.tipoDocumento, fuente: d.fuente, warnings: d.warnings },
        camposIcao(d),
        opciones,
        esMenor,
      ),
    };
  }
  const r = lectura.resultado;
  if (!r.valido) return { final: { ok: false, tipo: "mrz", error: "mrz-no-valida" } };
  const nacimiento = r.campos.fechaNacimiento;
  // OD-32 (d): la digital IC+COL solo es de mayores, con el parámetro encendido o apagado.
  // Stryker disable next-line ConditionalExpression: equivalente; con `valido` la fecha nunca es null (MZ-17), se comprueba para estrechar el tipo.
  if (nacimiento === null || !esMayorDeEdad(nacimiento, fechaReferencia)) return { final: menor };
  return {
    final: exito(
      { tipo: "mrz", intento: lectura.intento, resultado: enmascarar ? enmascararResultadoMrz(r) : r, tipoDocumento: "cedula-ciudadania", fuente: "mrz-td1", warnings: r.warnings },
      camposDigital(r),
      opciones,
    ),
  };
}


const PASOS: Readonly<Record<Lector, (p: Pixeles, d: DependenciasLectura, o: OpcionesLectura, respaldoPdf417: boolean) => Promise<Paso>>> = {
  pdf417: pasoPdf417,
  "mrz-td1": pasoMrz("td1"),
  "mrz-td3": pasoMrz("td3"),
};

/** OFF-06, OFF-27 y OD-21: orden de los lectores según la pista (`"mrz"` es alias de `"mrz-td1"`). */
function orden(pista: OpcionesLectura["pista"]): readonly Lector[] {
  if (pista === "mrz-td3") return ["mrz-td3", "mrz-td1", "pdf417"];
  if (pista === "mrz" || pista === "mrz-td1") return ["mrz-td1", "pdf417"];
  return ["pdf417", "mrz-td1"];
}

export async function leerDocumento(pixeles: Pixeles, deps: DependenciasLectura, opciones: OpcionesLectura): Promise<ResultadoLectura> {
  if (abortada(opciones.senal)) return CANCELADA;
  const lectores = orden(opciones.pista);
  // Sin pista la MRZ siempre se intenta tras no encontrar el PDF417 (OFF-06); con pista, salvo `respaldo: false`.
  const intentar = opciones.pista !== undefined && opciones.respaldo === false ? lectores.slice(0, 1) : lectores;
  let ultimo: ResultadoLectura = CANCELADA;
  let soloCe: ResultadoLectura | null = null;
  for (const lector of intentar) {
    // OFF-27c: la MRZ como respaldo de una pista PDF417 (en esta llamada o, con `respaldoDe`, en una aparte) lleva presupuesto corto.
    const respaldoPdf417 = opciones.respaldoDe === "pdf417" || (opciones.pista === "pdf417" && lector !== "pdf417");
    const paso = await PASOS[lector](pixeles, deps, opciones, respaldoPdf417);
    if ("final" in paso) {
      if (soloCe === null || paso.final === CANCELADA) return paso.final;
      return paso.final.ok && paso.final.tipoDocumento === "cedula-extranjeria" ? paso.final : soloCe;
    }
    if ("soloCe" in paso) soloCe = paso.soloCe;
    else ultimo = paso.noEncontrado;
  }
  return soloCe ?? ultimo;
}
