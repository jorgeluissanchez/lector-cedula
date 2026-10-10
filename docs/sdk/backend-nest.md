# Backend NestJS (plataforma Express)

`lector.nest()` devuelve un manejador `(req, res)` para un controlador con `@Req()` y `@Res()`. Nest no debe parsear el cuerpo de esa ruta.

```ts
import { Controller, All, Req, Res, OnModuleDestroy } from "@nestjs/common";
import { crearLectorServidor, type DocumentoConfirmado } from "@lector-cedula/servidor";

const lector = crearLectorServidor({
  async alConfirmar(documento: DocumentoConfirmado) {
    // Guarda en tu base lo que tu política permita.
  },
});
const manejar = lector.nest();

@Controller("api/cedula")
export class CedulaController implements OnModuleDestroy {
  @All()
  leer(@Req() req: unknown, @Res() res: unknown) {
    return manejar(req as never, res as never);
  }

  async onModuleDestroy() {
    await lector.cerrar();
  }
}
```

Con `NestFactory.create(App, { bodyParser: false })` o excluyendo la ruta del parser JSON, el lector lee el cuerpo crudo. Opciones: [backend-express.md](backend-express.md#opciones). Webhooks del modo microservicio: [nest.md](nest.md).
