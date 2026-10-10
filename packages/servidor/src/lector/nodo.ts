// MOT-19 y MOT-21: puente entre http.IncomingMessage/ServerResponse (Express, Nest sobre Express, Fastify con
// `reply.raw`) y `manejar(Request): Response`. Cada evento se escribe en cuanto llega (sin búfer: `flushHeaders`,
// `X-Accel-Buffering: no` y `res.flush()` si un middleware de compresión lo añadió) y cerrar la conexión cancela la
// lectura. Tipos estructurales: no se importa ningún framework.
import { Readable } from "node:stream";

export interface PeticionNodeLector extends AsyncIterable<unknown> {
  method?: string | undefined;
  url?: string | undefined;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Cuerpo ya leído por un middleware (`express.raw()`): se usa tal cual. */
  body?: unknown;
  readableEnded?: boolean;
}

export interface RespuestaNodeLector {
  statusCode: number;
  setHeader(nombre: string, valor: string): unknown;
  flushHeaders(): void;
  write(trozo: Uint8Array): boolean;
  end(): unknown;
  on(evento: "close" | "drain", fn: () => void): unknown;
  once(evento: "drain", fn: () => void): unknown;
  readonly writableFinished?: boolean;
  flush?: () => void;
}

export type ManejadorNode = (peticion: PeticionNodeLector, respuesta: RespuestaNodeLector) => Promise<void>;

function cabeceras(origen: PeticionNodeLector["headers"]): Headers {
  const h = new Headers();
  for (const [nombre, valor] of Object.entries(origen)) {
    if (valor === undefined) continue;
    for (const v of Array.isArray(valor) ? valor : [valor]) h.append(nombre, v);
  }
  return h;
}

function cuerpo(peticion: PeticionNodeLector): BodyInit | null {
  const metodo = (peticion.method ?? "GET").toUpperCase();
  if (metodo === "GET" || metodo === "HEAD") return null;
  if (peticion.body instanceof Uint8Array) return new Uint8Array(peticion.body);
  if (peticion.readableEnded === true) return null;
  return Readable.toWeb(Readable.from(peticion)) as ReadableStream<Uint8Array>;
}

export function manejadorNode(manejar: (peticion: Request) => Promise<Response>): ManejadorNode {
  return async (peticion, respuesta) => {
    const control = new AbortController();
    respuesta.on("close", () => {
      if (respuesta.writableFinished !== true) control.abort();
    });
    const h = cabeceras(peticion.headers);
    const ruta = peticion.originalUrl ?? peticion.url ?? "/";
    const init: RequestInit & { duplex: "half" } = {
      method: peticion.method ?? "GET",
      headers: h,
      body: cuerpo(peticion),
      signal: control.signal,
      duplex: "half",
    };
    const salida = await manejar(new Request(new URL(ruta, `http://${h.get("host") ?? "localhost"}`), init));
    respuesta.statusCode = salida.status;
    salida.headers.forEach((valor, nombre) => respuesta.setHeader(nombre, valor));
    respuesta.flushHeaders();
    if (salida.body === null) {
      respuesta.end();
      return;
    }
    const lector = salida.body.getReader();
    control.signal.addEventListener("abort", () => void lector.cancel().catch(() => undefined), { once: true });
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (!respuesta.write(value)) await new Promise<void>((r) => respuesta.once("drain", r));
        respuesta.flush?.();
      }
    } catch {
      // La conexión se cerró: la lectura ya se canceló.
    }
    respuesta.end();
  };
}
