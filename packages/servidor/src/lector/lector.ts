// MOT-19 a MOT-23 y MOT-25: crearLectorServidor. El motor corre en proceso, en el servidor de la empresa que integra la
// librería (nunca en un servidor del autor): `@lector-cedula/motor` como peerDependency opcional, o inyectado en
// `opciones.motor` (las pruebas usan un pool falso). Sin red, sin disco, búferes a cero (MOT-23).
import {
  codigoErrorMotor,
  PARAMETRO_STREAMING,
  TIPO_JSON,
  TIPO_NDJSON,
  type CodigoErrorMotor,
  type EventoIntermedio,
  type EventoResultado,
  type LecturaMotorOk,
  type MotivoRechazo,
  type MotorLector,
  type NivelRiesgo,
  type ResultadoMotor,
  type RiesgoMotor,
} from "@lector-cedula/protocolo";
import { compararConCliente, type Comparacion } from "./comparar.js";
import { cargarMotor } from "./carga.js";
import { borrar, CLIENTE_ILEGIBLE, leerEntrada, SIN_CLIENTE, type ClienteRecibido } from "./peticion.js";
import { manejadorNode, type ManejadorNode } from "./nodo.js";

export const BYTES_MAXIMOS = 10 * 1024 * 1024;
export const TIEMPO_MAXIMO_MS = 30_000;

/** Documento confirmado: la lectura del servidor sin `ok` ni `riesgo`, con `confiable: true`. */
export type DocumentoConfirmado = Omit<LecturaMotorOk, "ok"> & { readonly confiable: true };

export interface ContextoConfirmacion {
  readonly riesgo: RiesgoMotor | null;
  /** `null` cuando el front no envió su lectura local (modo front-back con dispositivo débil) o con `comparar: false`. */
  readonly comparacion: Comparacion | null;
  readonly peticion: Request;
}

export interface LimitesLector {
  /** Bytes máximos de la imagen (por omisión 10 MiB); por encima, 413 antes de terminar de leer el cuerpo. */
  readonly bytes?: number;
  /** Tiempo máximo de la lectura en el motor (por omisión 30 000 ms). */
  readonly tiempoMs?: number;
  /** Tipos admitidos (`TipoDocumento`); `"cedula"` equivale a `"cedula-ciudadania"`. Por omisión, todos. */
  readonly documentos?: readonly string[];
  /** Admite tarjetas de identidad y menores (por omisión `false`: `menor-de-edad`). */
  readonly admitirMenores?: boolean;
}

export interface OpcionesFraude {
  /** Nivel desde el que se rechaza con `fraude` (por omisión `"alto"`). */
  readonly rechazarDesde?: Exclude<NivelRiesgo, "bajo">;
}

export interface OpcionesLectorServidor {
  /** Se llama exactamente una vez, antes del evento final, solo si el resultado es `ok: true` (MOT-21). */
  readonly alConfirmar: (documento: DocumentoConfirmado, contexto: ContextoConfirmacion) => unknown;
  readonly limites?: LimitesLector;
  /** `false` omite el análisis de fraude (`riesgo: null`). */
  readonly fraude?: boolean | OpcionesFraude;
  /** `false` no compara con la lectura del cliente aunque llegue. Por omisión `true`. */
  readonly comparar?: boolean;
  /** Motor inyectado; sin él se carga `@lector-cedula/motor` (peerDependency opcional). */
  readonly motor?: MotorLector;
}

export interface LectorServidor {
  manejar(peticion: Request): Promise<Response>;
  /** Manejador `(req, res)` de Express. */
  express(): ManejadorNode;
  /** Manejador `(req, res)` para un controlador de Nest sobre Express (`@Req()`, `@Res()`). */
  nest(): ManejadorNode;
  /** Route handler de Next (`export const POST = lector.next()`, con `runtime = "nodejs"`). */
  next(): (peticion: Request) => Promise<Response>;
  /** Plugin de Fastify: `app.register(lector.fastify({ ruta: "/api/cedula" }))`. */
  fastify(opciones?: { ruta?: string }): (instancia: InstanciaFastify) => Promise<void>;
  cerrar(): Promise<void>;
}

export interface InstanciaFastify {
  removeAllContentTypeParsers(): void;
  addContentTypeParser(tipo: string, parser: (peticion: unknown, cuerpo: unknown, hecho: (error: null) => void) => void): void;
  all(ruta: string, manejador: (peticion: { raw: unknown }, respuesta: { raw: unknown; hijack(): void }) => Promise<unknown>): unknown;
}

const NIVELES: Readonly<Record<NivelRiesgo, number>> = { bajo: 0, medio: 1, alto: 2 };

const MOTIVO_POR_ERROR: Readonly<Partial<Record<CodigoErrorMotor, MotivoRechazo>>> = {
  "imagen-demasiado-grande": "demasiado-grande",
  "tiempo-agotado": "tiempo-agotado",
  "motor-ocupado": "ocupado",
  "formato-no-soportado": "ilegible",
};

const MOTIVO_POR_LECTURA: Readonly<Record<string, MotivoRechazo>> = {
  "menor-de-edad": "menor-de-edad",
  "documento-no-admitido": "documento-no-admitido",
  "ti-mayor-de-edad": "documento-no-admitido",
};

const ALIAS_DOCUMENTO: Readonly<Record<string, string>> = { cedula: "cedula-ciudadania" };

const CABECERAS_COMUNES = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

class Cancelada extends Error {}
const TIEMPO = Symbol("tiempo");

function rechazo(motivo: MotivoRechazo, diferencias?: readonly string[]): EventoResultado {
  return { etapa: "resultado", ok: false, rechazo: diferencias ? { motivo, diferencias } : { motivo } };
}

function respuestaUnica(evento: EventoResultado, estado: number): Response {
  return new Response(JSON.stringify(evento), { status: estado, headers: { "content-type": TIPO_JSON, ...CABECERAS_COMUNES } });
}

/** MOT-25: JSON único con `?streaming=0` o con `Accept: application/json` sin `application/x-ndjson`. */
function quiereJson(peticion: Request): boolean {
  if (new URL(peticion.url).searchParams.get(PARAMETRO_STREAMING) === "0") return true;
  const accept = (peticion.headers.get("accept") ?? "").toLowerCase();
  return accept.includes("application/json") && !accept.includes("application/x-ndjson");
}

function documentoConfirmado(lectura: LecturaMotorOk): DocumentoConfirmado {
  const copia: Record<string, unknown> = { ...lectura };
  delete copia.ok;
  delete copia.riesgo;
  return { ...(copia as Omit<LecturaMotorOk, "ok">), confiable: true };
}

export function crearLectorServidor(opciones: OpcionesLectorServidor): LectorServidor {
  const limites = opciones.limites ?? {};
  const bytesMaximos = limites.bytes ?? BYTES_MAXIMOS;
  const tiempoMs = limites.tiempoMs ?? TIEMPO_MAXIMO_MS;
  const admitirMenores = limites.admitirMenores === true;
  const documentos = limites.documentos?.map((d) => ALIAS_DOCUMENTO[d] ?? d);
  const fraudeActivo = opciones.fraude !== false;
  const rechazarDesde = typeof opciones.fraude === "object" ? (opciones.fraude.rechazarDesde ?? "alto") : "alto";
  const comparar = opciones.comparar !== false;
  const motor = cargarMotor(opciones.motor);

  /** Lee con el motor, acotado por tiempo y por la cancelación del cliente; nunca deja la imagen sin borrar. */
  async function leer(imagen: Uint8Array, senalCliente: AbortSignal, alProgreso: (p: number) => void): Promise<ResultadoMotor> {
    const control = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const corte = new Promise<never>((_r, rechazar) => {
      const cancelar = () => {
        control.abort();
        rechazar(new Cancelada());
      };
      if (senalCliente.aborted) cancelar();
      senalCliente.addEventListener("abort", cancelar, { once: true });
      temporizador = setTimeout(() => {
        control.abort();
        rechazar(TIEMPO);
      }, tiempoMs);
    });
    try {
      const m = await motor.obtener();
      return await Promise.race([
        m.leerDocumento(imagen, {
          senal: control.signal,
          fraude: fraudeActivo,
          admitirTarjetaIdentidad: admitirMenores,
          borrarEntrada: true,
          alProgreso,
        }),
        corte,
      ]);
    } finally {
      clearTimeout(temporizador);
      borrar(imagen);
    }
  }

  async function procesar(
    peticion: Request,
    senal: AbortSignal,
    imagen: Uint8Array,
    cliente: ClienteRecibido,
    emitir: (e: EventoIntermedio) => void,
  ): Promise<EventoResultado> {
    let ultimoProgreso = 0;
    emitir({ etapa: "leyendo", progreso: 0 });
    const alProgreso = (p: number) => {
      if (!(p > ultimoProgreso && p <= 1)) return;
      ultimoProgreso = p;
      emitir({ etapa: "leyendo", progreso: p });
    };
    let lectura: ResultadoMotor;
    try {
      lectura = await leer(imagen, senal, alProgreso);
    } catch (error) {
      if (error instanceof Cancelada || codigoErrorMotor(error) === "cancelado") throw new Cancelada();
      if (error === TIEMPO) return rechazo("tiempo-agotado");
      const codigo = codigoErrorMotor(error);
      return rechazo((codigo && MOTIVO_POR_ERROR[codigo]) ?? "error-interno");
    }
    if (senal.aborted) throw new Cancelada();
    if (!lectura.ok) return rechazo(MOTIVO_POR_LECTURA[lectura.error.codigo] ?? "ilegible");
    if (documentos && !documentos.includes(lectura.tipoDocumento)) return rechazo("documento-no-admitido");
    const esMenor = lectura.menorDeEdad === true || lectura.tipoDocumento === "tarjeta-identidad";
    if (esMenor && !admitirMenores) return rechazo("menor-de-edad");
    const riesgo = fraudeActivo ? lectura.riesgo : null;
    if (fraudeActivo) {
      emitir({ etapa: "fraude" });
      if (riesgo && NIVELES[riesgo.nivel] >= NIVELES[rechazarDesde]) return rechazo("fraude");
    }
    let comparacion: Comparacion | null = null;
    if (comparar && cliente !== SIN_CLIENTE) {
      emitir({ etapa: "comparando" });
      comparacion = compararConCliente(lectura, cliente === CLIENTE_ILEGIBLE ? null : cliente);
      if (!comparacion.coincide) return rechazo("no-coincide", comparacion.diferencias);
    }
    const documento = documentoConfirmado(lectura);
    if (senal.aborted) throw new Cancelada();
    try {
      await opciones.alConfirmar(documento, { riesgo, comparacion, peticion });
    } catch {
      // MOT-21: el mensaje del integrador nunca viaja al cliente.
      return rechazo("error-interno");
    }
    return { etapa: "resultado", ok: true, documento, riesgo };
  }

  async function manejar(peticion: Request): Promise<Response> {
    if (peticion.method !== "POST") {
      await peticion.body?.cancel().catch(() => undefined);
      return new Response(null, { status: 405, headers: { allow: "POST", ...CABECERAS_COMUNES } });
    }
    const json = quiereJson(peticion);
    let entrada: Awaited<ReturnType<typeof leerEntrada>>;
    try {
      entrada = await leerEntrada(peticion, bytesMaximos);
    } catch {
      entrada = { tipo: "malformada" };
    }
    if (entrada.tipo === "demasiado-grande") return respuestaUnica(rechazo("demasiado-grande"), 413);
    if (entrada.tipo === "no-admitido") return respuestaUnica(rechazo("ilegible"), 415);
    if (entrada.tipo === "malformada") return respuestaUnica(rechazo("ilegible"), 400);
    const { imagen, cliente } = entrada;

    if (json) {
      try {
        return respuestaUnica(await procesar(peticion, peticion.signal, imagen, cliente, () => undefined), 200);
      } catch {
        // Cancelada: el cliente ya no escucha; se responde vacío.
        return new Response(null, { status: 499, headers: CABECERAS_COMUNES });
      } finally {
        borrar(imagen);
      }
    }

    const codificador = new TextEncoder();
    const cancelacion = new AbortController();
    const senal = AbortSignal.any([peticion.signal, cancelacion.signal]);
    const cuerpo = new ReadableStream<Uint8Array>({
      start(controlador) {
        let abierto = true;
        const enviar = (e: EventoIntermedio | EventoResultado) => {
          if (abierto && !senal.aborted) controlador.enqueue(codificador.encode(`${JSON.stringify(e)}\n`));
        };
        enviar({ etapa: "recibido" });
        procesar(peticion, senal, imagen, cliente, enviar)
          .then((final) => {
            enviar(final);
            abierto = false;
            controlador.close();
          })
          .catch((error: unknown) => {
            // Un fallo inesperado (no una cancelación) aún cierra con un único evento final.
            if (!(error instanceof Cancelada)) enviar(rechazo("error-interno"));
            abierto = false;
            try {
              controlador.close();
            } catch {
              // ya cancelado por el consumidor
            }
          })
          .finally(() => borrar(imagen));
      },
      cancel() {
        cancelacion.abort();
      },
    });
    return new Response(cuerpo, { status: 200, headers: { "content-type": TIPO_NDJSON, "x-accel-buffering": "no", ...CABECERAS_COMUNES } });
  }

  const node = () => manejadorNode(manejar);
  return {
    manejar,
    express: node,
    nest: node,
    next: () => manejar,
    fastify:
      ({ ruta = "/api/cedula" } = {}) =>
      async (instancia) => {
        instancia.removeAllContentTypeParsers();
        // Deja el flujo sin consumir: manejar lo lee con su propio límite (MOT-23).
        instancia.addContentTypeParser("*", (_peticion, _cuerpo, hecho) => hecho(null));
        const manejador = node();
        instancia.all(ruta, async (peticion, respuesta) => {
          respuesta.hijack();
          await manejador(peticion.raw as Parameters<ManejadorNode>[0], respuesta.raw as Parameters<ManejadorNode>[1]);
        });
      },
    cerrar: () => motor.cerrar(),
  };
}
