# Fastify: webhooks del modo microservicio

Para el backend propio (recomendado) ve a [backend-fastify.md](backend-fastify.md). Esta guía es para recibir los webhooks del [modo microservicio](modo-microservicio.md).

```ts
import Fastify from "fastify";
import { webhookFastify } from "@lector-cedula/servidor/fastify";

const app = Fastify();
await app.register(
  webhookFastify({
    ruta: "/webhooks/lector",
    secreto: process.env.LECTOR_WEBHOOK as string,
    alRecibir: async (evento) => {
      // pide el resultado con crearCliente(...).obtenerResultado(evento.data.validation_id)
    },
  }),
);
```

El plugin está encapsulado: solo dentro de él se reemplaza el parser por uno que entrega los bytes crudos.
