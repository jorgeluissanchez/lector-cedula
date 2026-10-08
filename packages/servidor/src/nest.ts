// SDK-21: `imports: [WebhookLectorModule.registrar({ ruta: "/webhooks/lector", secreto, alRecibir })]`.
// Sin importar @nestjs: devuelve un DynamicModule cuya clase implementa NestModule.configure y monta el
// middleware de Express en POST de la ruta. Con `NestFactory.create(App, { rawBody: true })` usa req.rawBody.
import { webhookExpress } from "./express.js";
import type { OpcionesWebhook } from "./manejar.js";

export type { OpcionesWebhook } from "./manejar.js";

/** RequestMethod.POST de @nestjs/common. */
const POST = 1;

export interface OpcionesNest extends OpcionesWebhook {
  ruta: string;
}

interface ConsumidorMiddleware {
  apply(...middleware: unknown[]): { forRoutes(...rutas: { path: string; method: number }[]): unknown };
}

export interface ModuloWebhook {
  configure(consumidor: ConsumidorMiddleware): void;
}

export interface ModuloDinamico {
  module: new () => ModuloWebhook;
  global?: boolean;
}

export const WebhookLectorModule = {
  registrar(opciones: OpcionesNest): ModuloDinamico {
    const middleware = webhookExpress(opciones);
    class WebhookLector implements ModuloWebhook {
      configure(consumidor: ConsumidorMiddleware): void {
        consumidor.apply(middleware).forRoutes({ path: opciones.ruta, method: POST });
      }
    }
    return { module: WebhookLector };
  },
};
