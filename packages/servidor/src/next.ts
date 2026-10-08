// SDK-21: en app/api/webhooks/lector/route.ts, `export const POST = webhookNext({ secreto, alRecibir })`.
import { manejarWebhook, type OpcionesWebhook } from "./manejar.js";

export type { OpcionesWebhook } from "./manejar.js";

export function webhookNext(opciones: OpcionesWebhook): (peticion: Request) => Promise<Response> {
  return manejarWebhook(opciones);
}
