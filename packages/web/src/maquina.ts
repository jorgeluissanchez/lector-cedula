/**
 * Máquina de estados pura del núcleo (SDK-27, SDK-28, SDK-46, SDK-47; design.md, "Arquitectura del núcleo").
 * `transicion` solo produce las `TRANSICIONES` de la spec; un evento que no aplica en la fase actual devuelve el mismo
 * estado (nunca lanza).
 */
import { actualizar, normalizarGuia } from "./estado.js";
import type {
  CalidadLector,
  ContenidoLector,
  EnvioLector,
  ErrorLector,
  EstadoLector,
  FaseLector,
  FrameCalidad,
  IntentosVerificacion,
  RechazoLector,
  ResultadoPresentacion,
  VerificacionLector,
} from "./tipos.js";

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
  "activo>error",
  "listo>error",
  "permiso>inicio",
  "activo>inicio",
  "listo>inicio",
  "leyendo>inicio",
  "resultado>permiso",
  "error>permiso",
  // Backend propio (SDK-46, SDK-47, SDK-54, SDK-56).
  "leyendo>verificando",
  "activo>verificando",
  "listo>verificando",
  "verificando>resultado",
  "verificando>activo",
  "verificando>error",
  "verificando>inicio",
]);

export const permitida = (de: FaseLector, a: FaseLector): boolean => de === a || TRANSICIONES.has(`${de}>${a}`);

/** SDK-47: motivos que terminan en `error` sin reintento (decisión del orquestador, 2026-10-09, modos). */
export const MOTIVOS_TERMINALES: ReadonlySet<string> = new Set(["menor-de-edad", "documento-no-admitido"]);

export type EventoLector =
  | { readonly tipo: "iniciar"; readonly decision?: { readonly frontActivo: boolean; readonly modoMotivo: string } }
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
  | { readonly tipo: "envio"; readonly envio: EnvioLector }
  /** SDK-46, SDK-56: envío al backend; `resultado` local o `null` con front ligero. */
  | { readonly tipo: "verificar"; readonly resultado: ResultadoPresentacion | null; readonly contenido: ContenidoLector | null; readonly verificacion: VerificacionLector }
  | { readonly tipo: "etapa"; readonly verificacion: VerificacionLector }
  | { readonly tipo: "verificado"; readonly resultado: ResultadoPresentacion }
  /** SDK-47: `error` se usa si el rechazo es terminal o agota los intentos. */
  | { readonly tipo: "rechazo"; readonly rechazo: RechazoLector; readonly error?: ErrorLector };

const LIMPIO = { calidad: null, guia: null, contenido: null, progreso: null, resultado: null, error: null, envio: null } as const;
const SIN_VERIFICACION = { verificacion: null, rechazo: null } as const;

/** Pista de presencia (`"mrz"` es TD1) al contenido público. */
export function contenidoDePista(p: "pdf417" | "mrz" | null): ContenidoLector | null {
  if (p === "pdf417") return "pdf417";
  return p === "mrz" ? "mrz-td1" : null;
}

function calidad(frame: FrameCalidad): CalidadLector {
  return { score: Math.min(100, Math.max(0, frame.score)), motivo: frame.motivo };
}

const acotar = (v: number | null): number | null => (v === null ? null : Math.min(1, Math.max(0, v)));

const reiniciarIntentos = (i: IntentosVerificacion | null): IntentosVerificacion | null => (i === null ? null : { usados: 0, maximo: i.maximo });

const ACTIVAS: ReadonlySet<FaseLector> = new Set(["permiso", "activo", "listo", "leyendo", "verificando"]);

function rechazo(e: EstadoLector, ev: Extract<EventoLector, { tipo: "rechazo" }>): EstadoLector {
  if (e.fase !== "verificando" && e.fase !== "leyendo") return e;
  const previo = e.intentosVerificacion ?? { usados: 0, maximo: 1 };
  const intentos = { usados: Math.min(previo.maximo, previo.usados + 1), maximo: previo.maximo };
  const termina = MOTIVOS_TERMINALES.has(ev.rechazo.motivo) || intentos.usados >= intentos.maximo;
  if (termina) {
    return actualizar(e, { fase: "error", error: ev.error ?? { codigo: "verificacion-rechazada", mensaje: "" }, progreso: null, verificacion: null, rechazo: ev.rechazo, intentosVerificacion: intentos });
  }
  return actualizar(e, { ...LIMPIO, fase: "activo", verificacion: null, rechazo: ev.rechazo, intentosVerificacion: intentos });
}

export function transicion(e: EstadoLector, ev: EventoLector): EstadoLector {
  switch (ev.tipo) {
    case "iniciar":
      return e.fase === "inicio"
        ? actualizar(e, { ...LIMPIO, ...SIN_VERIFICACION, fase: "permiso", ...(ev.decision === undefined ? {} : { frontActivo: ev.decision.frontActivo, modoMotivo: ev.decision.modoMotivo }) })
        : e;
    case "camara-lista":
      return e.fase === "permiso" ? actualizar(e, { fase: "activo" }) : e;
    case "fallo":
      return ACTIVAS.has(e.fase) ? actualizar(e, { fase: "error", error: ev.error, progreso: null, verificacion: null }) : e;
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
      return ACTIVAS.has(e.fase)
        ? actualizar(e, { ...LIMPIO, ...SIN_VERIFICACION, fase: "inicio", intento: 1, error: ev.error ?? null, intentosVerificacion: reiniciarIntentos(e.intentosVerificacion) })
        : e;
    case "reintentar":
      return e.fase === "resultado" || e.fase === "error"
        ? actualizar(e, { ...LIMPIO, ...SIN_VERIFICACION, fase: "permiso", intento: e.intento + 1, intentosVerificacion: reiniciarIntentos(e.intentosVerificacion) })
        : e;
    case "envio": {
      if (e.fase !== "resultado" || e.resultado === null) return e;
      const resultado = ev.envio.estado === "enviado" ? { ...e.resultado, validacion_id: ev.envio.validacion_id } : e.resultado;
      return actualizar(e, { envio: ev.envio, resultado });
    }
    case "verificar":
      if (e.fase !== "leyendo" && e.fase !== "activo" && e.fase !== "listo") return e;
      return actualizar(e, {
        fase: "verificando",
        progreso: ev.resultado === null ? null : 1,
        resultado: ev.resultado,
        contenido: ev.contenido ?? e.contenido,
        verificacion: { etapa: ev.verificacion.etapa, progreso: acotar(ev.verificacion.progreso) },
      });
    case "etapa":
      return e.fase === "verificando" ? actualizar(e, { verificacion: { etapa: ev.verificacion.etapa, progreso: acotar(ev.verificacion.progreso) } }) : e;
    case "verificado": {
      if (e.fase !== "verificando") return e;
      const i = e.intentosVerificacion;
      return actualizar(e, {
        fase: "resultado",
        resultado: ev.resultado,
        error: null,
        ...SIN_VERIFICACION,
        intentosVerificacion: i === null ? null : { usados: Math.min(i.maximo, i.usados + 1), maximo: i.maximo },
      });
    }
    case "rechazo":
      return rechazo(e, ev);
  }
}
