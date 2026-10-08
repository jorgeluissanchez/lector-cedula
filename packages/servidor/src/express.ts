// SDK-21: `app.post("/webhooks/lector", webhookExpress({ secreto, alRecibir }))`.
import { procesarWebhook, type OpcionesWebhook } from "./manejar.js";
import { firmaNode, leerBytesNode, type PeticionNode, type RespuestaNode } from "./nodo.js";

export type { OpcionesWebhook } from "./manejar.js";

export function webhookExpress(opciones: OpcionesWebhook): (peticion: PeticionNode, respuesta: RespuestaNode) => Promise<void> {
  return async (peticion, respuesta) => {
    let estado: number;
    try {
      estado = await procesarWebhook(opciones, await leerBytesNode(peticion), firmaNode(peticion));
    } catch {
      estado = 400;
    }
    respuesta.status(estado).end();
  };
}
