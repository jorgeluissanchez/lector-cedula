/**
 * Máquina de estados pura del núcleo (SDK-27, SDK-28; design.md, "Arquitectura del núcleo"). `transicion` solo produce
 * las `TRANSICIONES` de la spec; un evento que no aplica en la fase actual devuelve el mismo estado (nunca lanza).
 */
import { actualizar, normalizarGuia } from "./estado.js";
import type { CalidadLector, ContenidoLector, EnvioLector, ErrorLector, EstadoLector, FaseLector, FrameCalidad, ResultadoPresentacion } from "./tipos.js";

/** Pares `origen>destino` permitidos (spec, convención `TRANSICIONES`). */
export const TRANSICIONES: ReadonlySet<string> = new Set([
  "inicio>permiso",
  "permiso>activo",
  "permiso>error",
  "activo>listo",
  "listo>activo",
  "listo>leyendo",
  "activo>leyendo",
  "leyendo>resultado",
  "leyendo>activo",
  "leyendo>error",
  "activo>inicio",
  "listo>inicio",
  "leyendo>inicio",
  "resultado>permiso",
  "error>permiso",
]);

export const permitida = (de: FaseLector, a: FaseLector): boolean => de === a || TRANSICIONES.has(`${de}>${a}`);

export type EventoLector =
  | { readonly tipo: "iniciar" }
  | { readonly tipo: "camara-lista" }
  | { readonly tipo: "fallo"; readonly error: ErrorLector }
  /** `apto`: el score alcanza el umbral de `listo`. */
  | { readonly tipo: "calidad"; readonly frame: FrameCalidad; readonly apto: boolean }
  | { readonly tipo: "leyendo"; readonly contenido: ContenidoLector | null }
  | { readonly tipo: "progreso"; readonly valor: number }
  | { readonly tipo: "resultado"; readonly resultado: ResultadoPresentacion; readonly contenido: ContenidoLector | null; readonly envio: EnvioLector | null }
  | { readonly tipo: "reintento-automatico" }
  | { readonly tipo: "cancelar"; readonly error?: ErrorLector }
  | { readonly tipo: "reintentar" }
  | { readonly tipo: "envio"; readonly envio: EnvioLector };

const LIMPIO = { calidad: null, guia: null, contenido: null, progreso: null, resultado: null, error: null, envio: null } as const;

/** Pista de presencia (`"mrz"` es TD1) al contenido público. */
export function contenidoDePista(p: "pdf417" | "mrz" | null): ContenidoLector | null {
  if (p === "pdf417") return "pdf417";
  return p === "mrz" ? "mrz-td1" : null;
}

function calidad(frame: FrameCalidad): CalidadLector {
  return { score: Math.min(100, Math.max(0, frame.score)), motivo: frame.motivo };
}

export function transicion(e: EstadoLector, ev: EventoLector): EstadoLector {
  switch (ev.tipo) {
    case "iniciar":
      return e.fase === "inicio" ? actualizar(e, { ...LIMPIO, fase: "permiso" }) : e;
    case "camara-lista":
      return e.fase === "permiso" ? actualizar(e, { fase: "activo" }) : e;
    case "fallo":
      return e.fase === "permiso" || e.fase === "leyendo" ? actualizar(e, { fase: "error", error: ev.error, progreso: null }) : e;
    case "calidad": {
      if (e.fase !== "activo" && e.fase !== "listo") return e;
      const guia = normalizarGuia(ev.frame.guia, ev.frame.anchoVideo, ev.frame.altoVideo);
      return actualizar(e, {
        fase: ev.apto ? "listo" : "activo",
        calidad: calidad(ev.frame),
        guia: guia ?? e.guia,
        contenido: contenidoDePista(ev.frame.contenido) ?? e.contenido,
      });
    }
    case "leyendo":
      return e.fase === "activo" || e.fase === "listo" ? actualizar(e, { fase: "leyendo", progreso: 0, contenido: ev.contenido ?? e.contenido }) : e;
    case "progreso":
      return e.fase === "leyendo" ? actualizar(e, { progreso: Math.min(1, Math.max(e.progreso ?? 0, ev.valor)) }) : e;
    case "resultado":
      return e.fase === "leyendo"
        ? actualizar(e, { fase: "resultado", progreso: 1, resultado: ev.resultado, contenido: ev.contenido ?? e.contenido, envio: ev.envio })
        : e;
    case "reintento-automatico":
      return e.fase === "leyendo" ? actualizar(e, { ...LIMPIO, fase: "activo", intento: e.intento + 1 }) : e;
    case "cancelar":
      return e.fase === "activo" || e.fase === "listo" || e.fase === "leyendo" ? actualizar(e, { ...LIMPIO, fase: "inicio", intento: 1, error: ev.error ?? null }) : e;
    case "reintentar":
      return e.fase === "resultado" || e.fase === "error" ? actualizar(e, { ...LIMPIO, fase: "permiso", intento: e.intento + 1 }) : e;
    case "envio": {
      if (e.fase !== "resultado" || e.resultado === null) return e;
      const resultado = ev.envio.estado === "enviado" ? { ...e.resultado, validacion_id: ev.envio.validacion_id } : e.resultado;
      return actualizar(e, { envio: ev.envio, resultado });
    }
  }
}
