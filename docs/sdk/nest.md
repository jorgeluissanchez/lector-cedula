# NestJS: webhooks del modo microservicio

Para el backend propio (recomendado) ve a [backend-nest.md](backend-nest.md). Esta guía es para recibir los webhooks del [modo microservicio](modo-microservicio.md).

```ts
import { Module } from "@nestjs/common";
import { WebhookLectorModule } from "@lector-cedula/servidor/nest";

@Module({
  imports: [
    WebhookLectorModule.registrar({
      ruta: "/webhooks/lector",
      secreto: process.env.LECTOR_WEBHOOK as string,
      alRecibir: async (evento) => {
        // pide el resultado con crearCliente(...).obtenerResultado(evento.data.validation_id)
      },
    }),
  ],
})
export class AppModule {}
```

Crea la app con `NestFactory.create(AppModule, { rawBody: true })` para que la firma se verifique sobre `req.rawBody`.
