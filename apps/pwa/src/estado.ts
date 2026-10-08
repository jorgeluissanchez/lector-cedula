/**
 * Reductor puro de pantallas de la PWA (design.md, decisión 8). Los efectos (cámara, Worker, captura) viven en App;
 * aquí solo se decide qué pantalla se muestra tras cada hecho.
 */
import type { CodigoErrorCamara, EstadoEntorno } from "@lector-cedula/capture";

export type CodigoError = CodigoErrorCamara | Exclude<EstadoEntorno, "apto">;

export type Estado =
  | { readonly pantalla: "inicio" | "activo" | "pausado" | "listo"; readonly aviso: string | null }
  | { readonly pantalla: "error"; readonly codigo: CodigoError; readonly aviso: string | null };

export type Pantalla = Estado["pantalla"];

export type Evento =
  /** La cámara arrancó tras "Iniciar cámara", "Reintentar", "Continuar" o "Repetir". */
  | { readonly tipo: "camara-iniciada" }
  | { readonly tipo: "fallo"; readonly codigo: CodigoError }
  | { readonly tipo: "aviso"; readonly texto: string }
  | { readonly tipo: "capturada" }
  | { readonly tipo: "cancelar" }
  | { readonly tipo: "oculta" };

export const ESTADO_INICIAL: Estado = Object.freeze({ pantalla: "inicio", aviso: null });

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
    case "cancelar":
      return { pantalla: "inicio", aviso: null };
    case "oculta":
      return e.pantalla === "activo" ? { pantalla: "pausado", aviso: null } : e;
  }
}
