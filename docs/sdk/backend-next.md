# Backend Next.js

`lector.next()` devuelve un route handler `(Request) => Promise<Response>`. Declara `runtime = "nodejs"`: el motor necesita `worker_threads` y no corre en Edge (en Edge el paquete resuelve a un módulo que falla con un mensaje claro).

<!-- ejemplo: examples/backend-next/app/api/cedula/route.ts -->
```ts
// Route handler del backend propio (MOT-12, MOT-13): el motor corre en este proceso del servidor de la empresa.
// Ley 1581 de 2012: la empresa obtiene antes la autorización del titular; aquí no se registra cuerpo, imagen ni campos.
import { crearLectorServidor, type DocumentoConfirmado } from "@lector-cedula/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo para las pruebas del ejemplo: NUIP de la última confirmación, en memoria. */
const confirmaciones = { total: 0, ultimoNuip: null as string | null };
(globalThis as { __confirmacionesEjemplo?: typeof confirmaciones }).__confirmacionesEjemplo = confirmaciones;

const lector = crearLectorServidor({
  alConfirmar(documento: DocumentoConfirmado) {
    confirmaciones.total++;
    confirmaciones.ultimoNuip = ((documento.campos as { nuip?: string }).nuip ?? null);
  },
});

export const POST = lector.next();
```

- `lector.manejar(peticion)` es la misma función sobre `Request`/`Response` estándar; sirve para Hono, Remix, Bun o Deno con Node APIs.
- Opciones y límites: ver [backend-express.md](backend-express.md#opciones).
- El motor se carga desde `node_modules`, sin empaquetar: añade `serverExternalPackages: ["@lector-cedula/motor", "@lector-cedula/servidor", "tesseract.js", "zxing-wasm"]` en `next.config.mjs` (en un monorepo con paquetes enlazados, compila con `next build --webpack`; ver `examples/backend-next/next.config.mjs`).
