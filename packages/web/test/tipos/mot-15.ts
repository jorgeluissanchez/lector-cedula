// MOT-15 "Sin enviarA en los tipos" (motor-backend-embebido): la opción retirada no existe en OpcionesLector; el envío
// al backend propio es solo `backend`. Verificación: `npx tsc -p packages/web/test/tipos --noEmit`.
import { crearLector } from "@lector-cedula/web";

// @ts-expect-error `enviarA` no existe (retirada el 2026-10-09 en favor de `backend`).
crearLector({ enviarA: { url: "/cedula" } });

crearLector({ backend: "/api/cedula", modo: "front-back", validacion: "auto", streaming: false });
