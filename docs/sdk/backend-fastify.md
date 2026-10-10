# Backend Fastify

`lector.fastify({ ruta })` devuelve un plugin encapsulado: dentro de él se sustituyen los parsers de cuerpo y el lector escribe directamente en la respuesta cruda (`hijack`). El resto de tu app conserva sus parsers.

```ts
import Fastify from "fastify";
import { crearLectorServidor } from "@lector-cedula/servidor";

const lector = crearLectorServidor({
  alConfirmar(documento) {
    // Guarda en tu base lo que tu política permita.
  },
});

const app = Fastify();
await app.register(lector.fastify({ ruta: "/api/cedula" }));
app.addHook("onClose", () => lector.cerrar());
await app.listen({ port: 3000 });
```

Opciones: [backend-express.md](backend-express.md#opciones). Webhooks del modo microservicio: [fastify.md](fastify.md).
