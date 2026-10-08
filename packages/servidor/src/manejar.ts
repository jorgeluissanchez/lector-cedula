// SDK-21: núcleo común de los adaptadores. Verifica sobre los bytes crudos y decide el estado HTTP:
// 204 si alRecibir resuelve, 400 con firma inválida (sin llamar alRecibir), 500 si alRecibir falla. Nunca hay cuerpo.
import { verificarWebhook, type EventoWebhook } from "./webhook.js";

export interface OpcionesWebhook {
  secreto: string;
  alRecibir: (evento: EventoWebhook) => unknown;
  /** Segundos de tolerancia (300 por defecto). */
  tolerancia?: number;
}

export const CABECERA_FIRMA = "x-lector-signature";

export async function procesarWebhook(opciones: OpcionesWebhook, cuerpo: Uint8Array, firma: string | null | undefined): Promise<204 | 400 | 500> {
  const entrada: Parameters<typeof verificarWebhook>[0] = { cuerpo, firma, secreto: opciones.secreto };
  if (opciones.tolerancia !== undefined) entrada.tolerancia = opciones.tolerancia;
  const resultado = await verificarWebhook(entrada);
  if (!resultado.valido) return 400;
  try {
    await opciones.alRecibir(resultado.evento);
    return 204;
  } catch {
    return 500;
  }
}

/** Manejador basado en Request y Response estándar (Next, Hono, Deno, Bun, workers). */
export function manejarWebhook(opciones: OpcionesWebhook): (peticion: Request) => Promise<Response> {
  return async (peticion) => {
    let cuerpo: Uint8Array;
    try {
      cuerpo = new Uint8Array(await peticion.arrayBuffer());
    } catch {
      return new Response(null, { status: 400 });
    }
    const estado = await procesarWebhook(opciones, cuerpo, peticion.headers.get(CABECERA_FIRMA));
    return new Response(null, { status: estado });
  };
}
