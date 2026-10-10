# Express: webhooks del modo microservicio

Para el backend propio (recomendado) ve a [backend-express.md](backend-express.md). Esta guía es para recibir los webhooks del [modo microservicio](modo-microservicio.md).

```ts
import express from "express";
import { webhookExpress } from "@lector-cedula/servidor/express";
import { crearCliente } from "@lector-cedula/servidor";

const cliente = crearCliente({ servidor: "https://api.lector-cedula.example", clave: process.env.LECTOR_CLAVE as string });
const app = express();
app.post(
  "/webhooks/lector",
  webhookExpress({
    secreto: process.env.LECTOR_WEBHOOK as string,
    alRecibir: async (evento) => {
      const validacion = await cliente.obtenerResultado(evento.data.validation_id);
      // decide con `validacion`, nunca con lo que mandó el navegador
    },
  }),
);
```

Monta la ruta antes de `express.json()`: la firma se verifica sobre los bytes crudos. Responde 204 si `alRecibir` resuelve, 400 con firma inválida (sin llamarlo) y 500 si falla.
