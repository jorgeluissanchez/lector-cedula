# Next.js (App Router)

El front usa `@lector-cedula/react` en un componente cliente (`"use client"`); el back es un route handler con `crearLectorServidor(...).next()` en el runtime `nodejs` (el motor usa `worker_threads`, no corre en Edge).

```sh
npm install @lector-cedula/web @lector-cedula/react @lector-cedula/servidor @lector-cedula/motor
```

## Componente cliente

<!-- ejemplo: examples/backend-next/app/lector.tsx -->
```tsx
"use client";
// Front React con backend propio (SDK-51): `backend: "/api/cedula"` del mismo origen y `autoIniciar`.
import { useLectorCedula } from "@lector-cedula/react";

export function Lector() {
  const { videoRef, estado, reintentar } = useLectorCedula({ recursos: "/lector-cedula/", backend: "/api/cedula", autoIniciar: true });
  return (
    <section>
      <video ref={videoRef} playsInline muted aria-label="Cámara" />
      <button type="button" data-prueba="reintentar" onClick={reintentar}>
        Otra vez
      </button>
      <p aria-live="polite">
        Estado: <b data-prueba="fase">{estado.fase}</b> · NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
      </p>
    </section>
  );
}
```

## Route handler

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

Detalle del back en [backend-next.md](backend-next.md).

## Recursos

Copia los assets a `public/lector-cedula/` antes de `next build` (por ejemplo en `prebuild`: `node copiar-recursos.mjs public/lector-cedula`) y pasa `recursos: "/lector-cedula/"`.

## Sin backend

El ejemplo `examples/next` usa solo el modo `front` (sin `backend`); el resultado es `confiable: false` y no debe usarse para decidir.
