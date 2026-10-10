// `BACK` de la spec (convenciones de sdk-integracion): backend de prueba en memoria que implementa el protocolo NDJSON
// de MOT-20 con guiones fijos (`ok`, `rechazo:<motivo>`, `503`, `colgado`, `basura`) y respuestas a medida. Registra
// cada petición (URL e `init`) y la señal recibida. Reloj falso para `tiempoLimiteMs` e `inactividadMs`.
import { CAMPOS_BASE } from "../falsos.js";

export const DOCUMENTO_BASE = Object.freeze({ tipo: "cedula-ciudadania", campos: CAMPOS_BASE, warnings: [] as string[] });

export type Guion = "ok" | `rechazo:${string}` | "503" | "colgado" | "basura" | Respuesta;

export interface Respuesta {
  readonly estado?: number;
  readonly tipo?: string;
  /** Fragmentos de texto o bytes; `"colgar"` deja el stream abierto tras los anteriores. */
  readonly fragmentos?: readonly (string | Uint8Array | "colgar")[];
  /** Rechaza el `fetch` (fallo de red). */
  readonly red?: boolean;
}

export interface Peticion {
  readonly url: string;
  readonly init: RequestInit;
  readonly senal: AbortSignal;
}

const linea = (o: unknown): string => `${JSON.stringify(o)}\n`;

export function guionOk(): Respuesta {
  return {
    fragmentos: [
      linea({ etapa: "recibido" }),
      linea({ etapa: "leyendo", progreso: 0.5 }),
      linea({ etapa: "fraude" }),
      linea({ etapa: "comparando" }),
      linea({ etapa: "resultado", ok: true, documento: DOCUMENTO_BASE }),
    ],
  };
}

function respuestaDe(g: Guion): Respuesta {
  if (typeof g !== "string") return g;
  if (g === "ok") return guionOk();
  if (g === "503") return { estado: 503, tipo: "application/json", fragmentos: ['{"error":"x"}'] };
  if (g === "colgado") return { fragmentos: ["colgar"] };
  if (g === "basura") return { fragmentos: ["{no-json\n"] };
  const motivo = g.slice("rechazo:".length);
  const rechazo = motivo === "no-coincide" ? { motivo, diferencias: ["campos.nuip"] } : { motivo };
  return { fragmentos: [linea({ etapa: "recibido" }), linea({ etapa: "resultado", ok: false, rechazo })] };
}

export interface BackFalso {
  readonly fetch: typeof fetch;
  readonly peticiones: Peticion[];
}

/** Cada petición consume el siguiente guion; el último se repite. */
export function crearBack(...guiones: Guion[]): BackFalso {
  const peticiones: Peticion[] = [];
  let i = 0;
  const fetchFalso = async (url: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const senal = init.signal ?? new AbortController().signal;
    peticiones.push({ url: String(url), init, senal });
    const r = respuestaDe(guiones[Math.min(i++, guiones.length - 1)] ?? "ok");
    await Promise.resolve();
    if (senal.aborted) throw new DOMException("abortada", "AbortError");
    if (r.red === true) throw new TypeError("Failed to fetch");
    const cod = new TextEncoder();
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        senal.addEventListener("abort", () => c.error(new DOMException("abortada", "AbortError")), { once: true });
        const partes = r.fragmentos ?? [];
        for (const p of partes) {
          if (p === "colgar") return;
          c.enqueue(typeof p === "string" ? cod.encode(p) : p);
        }
        c.close();
      },
    });
    return new Response(cuerpo, { status: r.estado ?? 200, headers: { "content-type": r.tipo ?? "application/x-ndjson; charset=utf-8" } });
  };
  return { fetch: fetchFalso as typeof fetch, peticiones };
}

export interface RelojFalso {
  temporizar(fn: () => void, ms: number): () => void;
  avanzar(ms: number): void;
  readonly pendientes: number;
}

export function crearReloj(): RelojFalso {
  let ahora = 0;
  let tareas: { en: number; fn: () => void }[] = [];
  return {
    temporizar(fn, ms) {
      const t = { en: ahora + ms, fn };
      tareas.push(t);
      return () => {
        tareas = tareas.filter((x) => x !== t);
      };
    },
    avanzar(ms) {
      ahora += ms;
      const vencidas = tareas.filter((t) => t.en <= ahora);
      tareas = tareas.filter((t) => t.en > ahora);
      for (const t of vencidas) t.fn();
    },
    get pendientes() {
      return tareas.length;
    },
  };
}

/** Deja correr las microtareas y los `setTimeout(0)` pendientes. */
export async function drenar(veces = 20): Promise<void> {
  for (let i = 0; i < veces; i++) await new Promise((r) => setTimeout(r, 0));
}
