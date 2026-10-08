/**
 * Reductor puro de pantallas de la PWA (design.md, decisión 8). Los efectos (cámara, Worker, captura) viven en App;
 * aquí solo se decide qué pantalla se muestra tras cada hecho. pwa-lectura-offline (OFF-19): `listo` es transitorio
 * hacia `leyendo`, que termina en `resultado` o `error-lectura`.
 */
import { clasificarErrorLectura, type CodigoErrorCamara, type CodigoErrorLectura, type EstadoEntorno, type ResultadoLectura } from "@lector-cedula/capture";

export type CodigoError = CodigoErrorCamara | Exclude<EstadoEntorno, "apto">;

export type LecturaCorrecta = Extract<ResultadoLectura, { ok: true }>;

export type Estado =
  | { readonly pantalla: "inicio" | "activo" | "pausado" | "listo" | "leyendo"; readonly aviso: string | null }
  | { readonly pantalla: "error"; readonly codigo: CodigoError; readonly aviso: string | null }
  | { readonly pantalla: "resultado"; readonly aviso: null; readonly lectura: LecturaCorrecta }
  | { readonly pantalla: "error-lectura"; readonly aviso: null; readonly errorLectura: CodigoErrorLectura }
  /** OFF-20: "Acerca de y licencias", con la pantalla a la que vuelve "Volver". */
  | { readonly pantalla: "licencias"; readonly aviso: null; readonly anterior: Estado };

export type Pantalla = Estado["pantalla"];

export type Evento =
  /** La cámara arrancó tras "Iniciar cámara", "Reintentar", "Continuar", "Leer otra" o "Intentar de nuevo". */
  | { readonly tipo: "camara-iniciada" }
  | { readonly tipo: "fallo"; readonly codigo: CodigoError }
  | { readonly tipo: "aviso"; readonly texto: string }
  | { readonly tipo: "capturada" }
  | { readonly tipo: "leyendo" }
  | { readonly tipo: "leida"; readonly resultado: ResultadoLectura }
  /** OFF-26: lectura fallida con reintentos disponibles; vuelve a la cámara sin mostrar el error. */
  | { readonly tipo: "reintento" }
  | { readonly tipo: "licencias" }
  | { readonly tipo: "volver" }
  | { readonly tipo: "cancelar" }
  | { readonly tipo: "oculta" };

export const ESTADO_INICIAL: Estado = Object.freeze({ pantalla: "inicio", aviso: null });

const LECTURA: ReadonlySet<Pantalla> = new Set(["leyendo", "resultado", "error-lectura", "licencias"]);

function leida(e: Estado, r: ResultadoLectura): Estado {
  if (e.pantalla !== "leyendo") return e;
  if (r.ok) return { pantalla: "resultado", aviso: null, lectura: r };
  if (r.error === "cancelada") return e;
  return { pantalla: "error-lectura", aviso: null, errorLectura: clasificarErrorLectura(r).codigo };
}

export function reducir(e: Estado, ev: Evento): Estado {
  switch (ev.tipo) {
    case "camara-iniciada":
      return e.pantalla === "activo" ? e : { pantalla: "activo", aviso: null };
    case "fallo":
      return { pantalla: "error", codigo: ev.codigo, aviso: null };
    case "aviso":
      return e.pantalla === "activo" ? { pantalla: "activo", aviso: ev.texto } : e;
    case "capturada":
      return e.pantalla === "activo" ? { pantalla: "listo", aviso: e.aviso } : e;
    case "leyendo":
      return e.pantalla === "listo" ? { pantalla: "leyendo", aviso: null } : e;
    case "leida":
      return leida(e, ev.resultado);
    case "reintento":
      return e.pantalla === "leyendo" ? { pantalla: "activo", aviso: null } : e;
    case "licencias":
      return e.pantalla === "inicio" || e.pantalla === "resultado" ? { pantalla: "licencias", aviso: null, anterior: e } : e;
    case "volver":
      return e.pantalla === "licencias" ? e.anterior : e;
    case "cancelar":
      return { pantalla: "inicio", aviso: null };
    case "oculta":
      if (e.pantalla === "activo") return { pantalla: "pausado", aviso: null };
      return LECTURA.has(e.pantalla) ? { pantalla: "inicio", aviso: null } : e;
  }
}
