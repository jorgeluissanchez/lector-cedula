/**
 * Cliente del protocolo en vivo con el backend propio (SDK-45, SDK-48, SDK-54, SDK-59; MOT-20, MOT-25). Una petición
 * `POST` multipart (`imagen` y, con front activo, `cliente`) con `fetch`; la respuesta NDJSON se lee con
 * `ReadableStream.getReader()` y `TextDecoder` en modo stream. Sin WebSocket, EventSource ni sondeo. Nunca lanza:
 * devuelve `ok`, `rechazo`, `fallo` (código de transporte) o `cancelado`. Se importa dinámicamente solo con `backend`.
 */
import { CAMPO_CLIENTE, CAMPO_IMAGEN, validarEvento, type EventoIntermedio, type EventoProtocolo, type EventoResultado, type Rechazo } from "@lector-cedula/protocolo";

export type CodigoTransporte = "backend-no-disponible" | "backend-rechazo-http" | "backend-tiempo-agotado" | "protocolo-invalido";

export type SalidaVerificacion =
  | { readonly tipo: "ok"; readonly documento: DocumentoBackend }
  | { readonly tipo: "rechazo"; readonly rechazo: Rechazo }
  | { readonly tipo: "fallo"; readonly codigo: CodigoTransporte }
  | { readonly tipo: "cancelado" };

export interface DocumentoBackend {
  readonly tipo?: string;
  readonly tipoDocumento?: string;
  readonly campos: Record<string, unknown>;
  readonly warnings?: readonly string[];
}

export type Encabezados = Readonly<Record<string, string>> | (() => Readonly<Record<string, string>> | Promise<Readonly<Record<string, string>>>);

export interface DatosVerificacion {
  readonly backend: string;
  readonly encabezados?: Encabezados | undefined;
  readonly imagen: Blob;
  /** Lectura local (`tipo`, `campos`) para que el back compare (MOT-10); ausente con front ligero. */
  readonly cliente?: unknown;
  readonly streaming: boolean;
  fetch: typeof fetch;
  readonly tiempoLimiteMs: number;
  readonly inactividadMs: number;
  readonly temporizar: (fn: () => void, ms: number) => () => void;
  /** Señal de `cancelar`/`destruir`. */
  readonly senal: AbortSignal;
  readonly alEvento: (e: EventoIntermedio) => void;
}

export interface PasoLector {
  readonly eventos: EventoProtocolo[];
  readonly invalido: boolean;
}

export interface LectorNdjson {
  empujar(bytes: Uint8Array): PasoLector;
  /** Fin del stream: procesa la última línea sin salto y exige el evento final. */
  terminar(): PasoLector;
  readonly final: EventoResultado | null;
}

/** Lector de líneas NDJSON incremental: tolera líneas partidas (también dentro de un carácter UTF-8) y líneas vacías. */
export function crearLectorNdjson(): LectorNdjson {
  const decodificador = new TextDecoder("utf-8");
  let resto = "";
  let invalido = false;
  let final: EventoResultado | null = null;

  function lineas(texto: string, cierre: boolean): PasoLector {
    const eventos: EventoProtocolo[] = [];
    if (invalido) return { eventos, invalido };
    const partes = (resto + texto).split("\n");
    resto = cierre ? "" : (partes.pop() ?? "");
    for (const l of partes) {
      if (l.trim() === "") continue;
      let e: unknown;
      try {
        e = JSON.parse(l);
      } catch {
        e = undefined;
      }
      if (final !== null || !validarEvento(e)) {
        invalido = true;
        return { eventos, invalido };
      }
      if (e.etapa === "resultado") final = e as EventoResultado;
      eventos.push(e);
    }
    if (cierre && final === null) invalido = true;
    return { eventos, invalido };
  }

  return {
    empujar: (bytes) => lineas(decodificador.decode(bytes, { stream: true }), false),
    terminar: () => lineas(decodificador.decode(), true),
    get final() {
      return final;
    },
  };
}

const fallo = (codigo: CodigoTransporte): SalidaVerificacion => ({ tipo: "fallo", codigo });

function documentoValido(d: unknown): d is DocumentoBackend {
  return typeof d === "object" && d !== null && typeof (d as { campos?: unknown }).campos === "object" && (d as { campos?: unknown }).campos !== null;
}

function desenlace(e: EventoResultado): SalidaVerificacion {
  if (!e.ok) return { tipo: "rechazo", rechazo: e.rechazo };
  return documentoValido(e.documento) ? { tipo: "ok", documento: e.documento } : fallo("protocolo-invalido");
}

const tipoDe = (r: Response): string => (r.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

export async function verificar(d: DatosVerificacion): Promise<SalidaVerificacion> {
  if (d.senal.aborted) return { tipo: "cancelado" };
  const control = new AbortController();
  let motivoAborto: "tiempo" | "cancelado" | null = null;
  const abortar = (m: "tiempo" | "cancelado"): void => {
    motivoAborto ??= m;
    control.abort();
  };
  const alCancelar = (): void => abortar("cancelado");
  d.senal.addEventListener("abort", alCancelar, { once: true });
  const pararTotal = d.temporizar(() => abortar("tiempo"), d.tiempoLimiteMs);
  let pararInactividad: () => void = () => undefined;
  const vigilar = (): void => {
    pararInactividad();
    pararInactividad = d.temporizar(() => abortar("tiempo"), d.inactividadMs);
  };
  const interrumpido = (): SalidaVerificacion | null =>
    motivoAborto === "cancelado" ? { tipo: "cancelado" } : motivoAborto === "tiempo" ? fallo("backend-tiempo-agotado") : null;

  try {
    let extra: Readonly<Record<string, string>>;
    try {
      extra = typeof d.encabezados === "function" ? await d.encabezados() : (d.encabezados ?? {});
    } catch {
      return fallo("backend-no-disponible");
    }
    const cabeceras = new Headers(extra);
    cabeceras.set("Accept", d.streaming ? "application/x-ndjson" : "application/json");
    const cuerpo = new FormData();
    cuerpo.append(CAMPO_IMAGEN, d.imagen, "imagen.jpg");
    if (d.cliente !== undefined) cuerpo.append(CAMPO_CLIENTE, JSON.stringify(d.cliente));
    vigilar();
    let r: Response;
    try {
      r = await d.fetch(d.backend, { method: "POST", body: cuerpo, headers: cabeceras, credentials: "same-origin", cache: "no-store", redirect: "error", signal: control.signal });
    } catch {
      return interrumpido() ?? fallo("backend-no-disponible");
    }
    if (r.status === 413) return { tipo: "rechazo", rechazo: { motivo: "demasiado-grande" } };
    if (r.status >= 500) return fallo("backend-no-disponible");
    if (r.status !== 200) return fallo("backend-rechazo-http");
    const tipo = tipoDe(r);
    if (!d.streaming) {
      if (tipo !== "application/json") return fallo("protocolo-invalido");
      let e: unknown;
      try {
        e = JSON.parse(await r.text());
      } catch {
        return interrumpido() ?? fallo("protocolo-invalido");
      }
      return validarEvento(e) && e.etapa === "resultado" ? desenlace(e as EventoResultado) : fallo("protocolo-invalido");
    }
    if (tipo !== "application/x-ndjson" || r.body === null) return fallo("protocolo-invalido");
    const lector = crearLectorNdjson();
    const lectorBytes = r.body.getReader();
    for (;;) {
      let paso: ReadableStreamReadResult<Uint8Array>;
      try {
        paso = await lectorBytes.read();
      } catch {
        // Tras el evento final, un corte del stream no cambia el desenlace.
        if (lector.final !== null && motivoAborto !== "cancelado") return desenlace(lector.final);
        return interrumpido() ?? fallo("backend-no-disponible");
      }
      const p = paso.done ? lector.terminar() : lector.empujar(paso.value);
      for (const e of p.eventos) if (e.etapa !== "resultado") d.alEvento(e);
      if (p.invalido) return fallo("protocolo-invalido");
      if (paso.done) return lector.final === null ? fallo("protocolo-invalido") : desenlace(lector.final);
      vigilar();
    }
  } finally {
    pararTotal();
    pararInactividad();
    d.senal.removeEventListener("abort", alCancelar);
    control.abort();
  }
}
