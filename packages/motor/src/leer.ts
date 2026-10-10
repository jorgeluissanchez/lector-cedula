// MOT-01, MOT-03 y MOT-09: una lectura en el hilo actual (worker o principal), compuesta solo con lo que ya existe:
// `leerDocumento` de @lector-cedula/capture (el mismo orden que la CLI: PDF417 y, sin él, MRZ), los parsers y
// @lector-cedula/fraud. Aquí no hay reglas propias de checksum, DIVIPOL ni edad. La imagen se decodifica una vez y los
// píxeles se ponen a cero al terminar, también ante error (MOT-07).
import { decodificarPdf417Imagen, decodificarPixeles, leerDocumento, type LectorMrz, type ResultadoLectura } from "@lector-cedula/capture";
import { evaluarFraude, type EntradaFraude } from "@lector-cedula/fraud";
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { ErrorMotor, type ResultadoMotor, type RiesgoMotor } from "@lector-cedula/protocolo";
import { registrarBufer } from "./recursos.js";

export interface OpcionesLeer {
  readonly fechaReferencia: string;
  readonly admitirTarjetaIdentidad: boolean;
  readonly fraude: boolean;
  readonly senal?: AbortSignal;
}

/** Fecha de hoy en America/Bogota (`AAAA-MM-DD`), como la CLI. */
export function hoyEnBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

const SIN_LECTURA = new Set(["pdf417-no-encontrado", "mrz-no-encontrada"]);
const ILEGIBLE = new Set(["imagen-ilegible", "entrada-invalida"]);

type LecturaOk = Extract<ResultadoLectura, { ok: true }>;

/** Entrada de @lector-cedula/fraud para la cédula y la tarjeta de identidad (amarilla por PDF417, digital por MRZ TD1); otros documentos, ninguna (MOT-09).
 * Interna: no se reexporta en index.ts; se exporta solo para las pruebas. */
export function entradaFraude(lectura: LecturaOk, pixeles: { data: Uint8ClampedArray; width: number; height: number }): EntradaFraude | null {
  const esCedula = lectura.tipoDocumento === "cedula-ciudadania" || lectura.tipoDocumento === "tarjeta-identidad";
  if (!esCedula || (lectura.fuente !== "pdf417" && lectura.fuente !== "mrz-td1")) return null;
  const { width: w, height: h } = pixeles;
  const base = {
    frames: [pixeles],
    // Sin detector de bordes en el servidor: la imagen completa como guía (FRA-20 omite las señales geométricas).
    cuadrilatero: [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }] as EntradaFraude["cuadrilatero"],
    cuadrilateroAproximado: true,
    cara: "reverso" as const,
    reloj: () => new Date(),
  };
  if (lectura.fuente === "pdf417") {
    const c = lectura.campos;
    const crudo = (lectura.resultado as { campos?: { codigoDepartamentoNacimiento?: string | null; codigoMunicipioNacimiento?: string | null } }).campos;
    const codigoLugar = crudo?.codigoDepartamentoNacimiento && crudo.codigoMunicipioNacimiento ? `${crudo.codigoDepartamentoNacimiento}${crudo.codigoMunicipioNacimiento}` : undefined;
    return {
      ...base,
      tipo: "amarilla",
      datos: { pdf417: { ...(c.nuip ? { nuip: c.nuip } : {}), ...(c.fechaNacimiento ? { fechaNacimiento: c.fechaNacimiento } : {}), ...(codigoLugar ? { codigoLugar } : {}) } },
    };
  }
  const lineas = (lectura.resultado as { lineasCorregidas?: unknown }).lineasCorregidas;
  return { ...base, tipo: "digital", datos: { mrz: { lineas } } };
}

export async function leerImagen(bytes: Uint8Array, lectorMrz: Pick<LectorMrz, "leer">, opciones: OpcionesLeer): Promise<ResultadoMotor> {
  const pixeles = await decodificarPixeles(bytes);
  if (pixeles === null) return { ok: false, error: { codigo: "imagen-ilegible" }, confiable: false, riesgo: null };
  registrarBufer(pixeles.data);
  // Se conserva `digitosValidos` de la última MRZ leída para el error `mrz-no-valida` (la CLI lo muestra, LPI-06).
  let digitosValidos: number | null = null;
  const lectorConDigitos: Pick<LectorMrz, "leer"> = {
    async leer(...args) {
      const r = await lectorMrz.leer(...args);
      if (r.ok) digitosValidos = r.digitosValidos;
      return r;
    },
  };
  try {
    const lectura = await leerDocumento(
      pixeles,
      { decodificar: decodificarPdf417Imagen, lectorMrz: lectorConDigitos, parsearPdf417: parsearPdf417Amarilla, buscarDivipol },
      {
        fechaReferencia: opciones.fechaReferencia,
        enmascarar: false,
        admitirTarjetaIdentidad: opciones.admitirTarjetaIdentidad,
        ...(opciones.senal ? { senal: opciones.senal } : {}),
      },
    );
    if (!lectura.ok) {
      if (lectura.error === "cancelada") throw new ErrorMotor("cancelado");
      if (lectura.error === "modelo-no-disponible" || lectura.error === "lector-terminado") throw new ErrorMotor("motor-error-interno");
      if (lectura.error === "fecha-referencia-invalida") throw new ErrorMotor("opciones-invalidas");
      const codigo = SIN_LECTURA.has(lectura.error) ? "sin-lectura" : ILEGIBLE.has(lectura.error) ? "imagen-ilegible" : lectura.error;
      const error = {
        codigo,
        ...(lectura.tipo ? { tipo: lectura.tipo } : {}),
        ...(codigo === "mrz-no-valida" && digitosValidos !== null ? { digitosValidos } : {}),
      };
      return { ok: false, error, confiable: false, riesgo: null };
    }
    let riesgo: RiesgoMotor | null = null;
    if (opciones.fraude) {
      const entrada = entradaFraude(lectura, pixeles);
      if (entrada) riesgo = evaluarFraude(entrada) as unknown as RiesgoMotor;
    }
    return { ...lectura, confiable: false, riesgo };
  } finally {
    pixeles.data.fill(0);
  }
}
