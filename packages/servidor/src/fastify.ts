// SDK-21: `app.register(webhookFastify({ ruta: "/webhooks/lector", secreto, alRecibir }))`.
// Plugin encapsulado: dentro de él se sustituyen los parsers por uno que entrega los bytes crudos; las demás
// rutas de la aplicación conservan el parser JSON de Fastify. Tipos estructurales, sin importar fastify.
import { procesarWebhook, type OpcionesWebhook } from "./manejar.js";

export type { OpcionesWebhook } from "./manejar.js";

export interface OpcionesFastify extends OpcionesWebhook {
  ruta: string;
}

interface PeticionFastify {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface RespuestaFastify {
  code(estado: number): { send(): unknown };
}

interface InstanciaFastify {
  removeAllContentTypeParsers(): void;
  addContentTypeParser(tipo: string, opciones: { parseAs: "buffer" }, parser: (peticion: unknown, cuerpo: Uint8Array, hecho: (error: null, cuerpo: Uint8Array) => void) => void): void;
  post(ruta: string, manejador: (peticion: PeticionFastify, respuesta: RespuestaFastify) => Promise<unknown>): unknown;
}

export function webhookFastify(opciones: OpcionesFastify): (instancia: InstanciaFastify) => Promise<void> {
  return async (instancia) => {
    instancia.removeAllContentTypeParsers();
    instancia.addContentTypeParser("*", { parseAs: "buffer" }, (_peticion, cuerpo, hecho) => hecho(null, cuerpo));
    instancia.post(opciones.ruta, async (peticion, respuesta) => {
      const cuerpo = peticion.body instanceof Uint8Array ? peticion.body : new Uint8Array(0);
      const cabecera = peticion.headers["x-lector-signature"];
      const firma = Array.isArray(cabecera) ? cabecera[0] : cabecera;
      return respuesta.code(await procesarWebhook(opciones, cuerpo, firma)).send();
    });
  };
}
