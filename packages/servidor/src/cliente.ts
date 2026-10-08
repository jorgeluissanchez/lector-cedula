// SDK-18 y SDK-19: cliente HTTP de la API de validaciones (AV-xx) con fetch inyectable.
// La clave vive solo en el cierre: no es propiedad del objeto, no aparece en JSON.stringify,
// toString ni en los mensajes de error.

export interface ErrorCampo {
  pointer: string;
  code: string;
  [clave: string]: unknown;
}

export class ErrorLector extends Error {
  override readonly name = "ErrorLector";
  /** Estado HTTP; 0 si no hubo respuesta (error de red). */
  readonly estado: number;
  /** Slug del `type` RFC 9457 (`invalid-request`, `not-found`...), `network-error`, `http-error` o `invalid-response`. */
  readonly tipo: string;
  readonly errores: ErrorCampo[];

  constructor(estado: number, tipo: string, errores: ErrorCampo[] = []) {
    super(`Lector: ${estado} ${tipo}`);
    this.estado = estado;
    this.tipo = tipo;
    this.errores = errores;
  }
}

export interface OpcionesCliente {
  /** URL base del servidor, por ejemplo `https://api.lector-cedula.example`. */
  servidor: string;
  /** Clave secreta `sk_test_...` o `sk_live_...`. Solo en el backend. */
  clave: string;
  fetch?: typeof fetch;
}

export interface Autorizacion {
  datos: boolean;
  sensibles: boolean;
  version_texto: string;
  otorgada_en: string;
}

export interface EntradaSesion {
  autorizacion: Autorizacion;
  tipoDocumento: string;
  urlRetorno?: string;
  urlWebhook?: string;
  claveIdempotencia?: string;
}

export interface Sesion {
  id: string;
  urlAlojada: string;
  /** Vencimiento de la sesión alojada (`upload.expires_at`, SDK-13). */
  expiraEn: string | null;
  sandbox: boolean;
}

/** Objeto validación tal como lo devuelve la API (AV-03). */
export type Validacion = Record<string, unknown>;

export interface ClienteLector {
  crearSesion(entrada: EntradaSesion): Promise<Sesion>;
  obtenerResultado(id: string): Promise<Validacion>;
  suprimir(id: string): Promise<void>;
}

function slugDe(cuerpo: unknown): string | null {
  const tipo = (cuerpo as { type?: unknown } | null | undefined)?.type;
  if (typeof tipo !== "string") return null;
  const slug = tipo.slice(tipo.lastIndexOf("/") + 1);
  return slug === "" ? null : slug;
}

function erroresDe(cuerpo: unknown): ErrorCampo[] {
  const errores = (cuerpo as { errors?: unknown } | null | undefined)?.errors;
  return Array.isArray(errores) ? (errores as ErrorCampo[]) : [];
}

function leerJson(respuesta: Response): Promise<unknown> {
  return respuesta.json().catch(() => undefined);
}

export function crearCliente(opciones: OpcionesCliente): ClienteLector {
  let base: URL;
  try {
    base = new URL(opciones.servidor);
  } catch {
    throw new TypeError("crearCliente: `servidor` no es una URL válida");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new TypeError("crearCliente: `servidor` debe ser http o https");
  if (typeof opciones.clave !== "string" || opciones.clave === "") throw new TypeError("crearCliente: falta `clave`");
  const clave = opciones.clave;
  const raiz = base.href.replace(/\/+$/, "");
  const hacerFetch = opciones.fetch;

  async function pedir(metodo: string, ruta: string, cabeceras: Record<string, string>, cuerpo?: string): Promise<Response> {
    const f = hacerFetch ?? globalThis.fetch;
    let respuesta: Response;
    try {
      const init: RequestInit = { method: metodo, headers: { authorization: `Bearer ${clave}`, accept: "application/json", ...cabeceras } };
      if (cuerpo !== undefined) init.body = cuerpo;
      respuesta = await f(`${raiz}${ruta}`, init);
    } catch {
      // El error original no se adjunta: podría citar cabeceras o la URL completa.
      throw new ErrorLector(0, "network-error");
    }
    if (!respuesta.ok) {
      const problema = await leerJson(respuesta);
      throw new ErrorLector(respuesta.status, slugDe(problema) ?? "http-error", erroresDe(problema));
    }
    return respuesta;
  }

  async function pedirJson(metodo: string, ruta: string, cabeceras: Record<string, string>, cuerpo?: string): Promise<Record<string, unknown>> {
    const respuesta = await pedir(metodo, ruta, cabeceras, cuerpo);
    const datos = await leerJson(respuesta);
    if (typeof datos !== "object" || datos === null) throw new ErrorLector(respuesta.status, "invalid-response");
    return datos as Record<string, unknown>;
  }

  const rutaDe = (id: string) => `/v1/validations/${encodeURIComponent(id)}`;

  const cliente: ClienteLector = {
    async crearSesion(entrada) {
      // JSON.stringify omite los opcionales ausentes (undefined).
      const cuerpo = { document_type: entrada.tipoDocumento, autorizacion: entrada.autorizacion, return_url: entrada.urlRetorno, webhook_url: entrada.urlWebhook };
      const datos = await pedirJson(
        "POST",
        "/v1/validations",
        { "content-type": "application/json", "idempotency-key": entrada.claveIdempotencia ?? crypto.randomUUID() },
        JSON.stringify(cuerpo),
      );
      const subida = datos.upload as { expires_at?: unknown } | null | undefined;
      return {
        id: datos.id as string,
        urlAlojada: datos.hosted_url as string,
        expiraEn: typeof subida?.expires_at === "string" ? subida.expires_at : null,
        sandbox: datos.sandbox as boolean,
      };
    },
    obtenerResultado(id) {
      return pedirJson("GET", rutaDe(id), {});
    },
    async suprimir(id) {
      await pedir("DELETE", rutaDe(id), {});
    },
  };
  Object.defineProperty(cliente, "toString", { value: () => "[ClienteLector]", enumerable: false });
  Object.defineProperty(cliente, "toJSON", { value: () => ({ servidor: raiz }), enumerable: false });
  return cliente;
}
