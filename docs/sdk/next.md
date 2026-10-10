# Next.js (App Router)

El front usa `@lector-cedula/react` en un componente cliente (`"use client"`); el back es un route handler con `crearLectorServidor(...).next()` en el runtime `nodejs` (el motor usa `worker_threads`, no corre en Edge).

```sh
npm install @lector-cedula/web @lector-cedula/react @lector-cedula/servidor @lector-cedula/motor
```

## Componente cliente

<!-- ejemplo: examples/backend-next/app/lector.tsx -->
```tsx
"use client";
// Front React con backend propio (SDK-51): `backend: "/api/cedula"` del mismo origen y `autoIniciar`. La UI muestra la
// fase, la etapa de la verificación (y las etapas vistas), el rechazo y si el resultado es confiable. `?autoIniciar=0`
// deja la cámara cerrada hasta pulsar "Empezar" (E2E de accesibilidad en la fase `inicio`).
// Ley 1581 de 2012, art. 9 (SDK-51): la cámara no se abre hasta marcar la casilla de autorización del titular, que empieza
// sin marcar; "Empezar" está deshabilitado hasta entonces y `autoIniciar` solo actúa ya autorizado. El texto es una
// plantilla: en producción el lector va detrás de la autorización que la empresa obtiene y conserva con su política.
import { useMemo, useRef, useState } from "react";
import { crearLector, type ControladorLector, type DependenciasLector, type OpcionesLector } from "@lector-cedula/web";
import { useLectorCedula } from "@lector-cedula/react";

/** Historial sin repeticiones consecutivas de las etapas, observado con `suscribir` para no perder ninguna. */
function useEtapas() {
  const [etapas, fijar] = useState<string[]>([]);
  const actual = useRef<ControladorLector | null>(null);
  const crear = useMemo(
    () => (opciones: OpcionesLector, deps?: DependenciasLector): ControladorLector => {
      const c = crearLector(opciones, deps);
      actual.current = c;
      fijar([]);
      c.suscribir(() => {
        const etapa = actual.current === c ? c.obtenerEstado().verificacion?.etapa : undefined;
        if (etapa !== undefined) fijar((l) => (l.at(-1) === etapa ? l : [...l, etapa]));
      });
      return c;
    },
    [],
  );
  return { etapas, crear };
}

export function Lector() {
  const { etapas, crear } = useEtapas();
  const [autorizado, fijarAutorizado] = useState(false);
  // En el servidor no hay `location`: el valor solo se usa en el efecto del navegador (no cambia el HTML).
  const autoIniciar = typeof window === "undefined" || new URLSearchParams(window.location.search).get("autoIniciar") !== "0";
  const { videoRef, estado, iniciar, reintentar } = useLectorCedula({ recursos: "/lector-cedula/", backend: "/api/cedula", autoIniciar: autoIniciar && autorizado }, { crear });
  return (
    <section>
      <video ref={videoRef} playsInline muted aria-label="Cámara" />
      <label>
        <input type="checkbox" data-prueba="autorizacion" checked={autorizado} onChange={(e) => fijarAutorizado(e.target.checked)} />
        Autorizo el tratamiento de los datos de mi cédula para verificar mi identidad, según la política de tratamiento de datos de
        [nombre del integrador].
      </label>
      {estado.fase === "inicio" ? (
        <button type="button" data-prueba="empezar" disabled={!autorizado} onClick={() => void iniciar()}>
          Empezar
        </button>
      ) : null}
      <button type="button" data-prueba="reintentar" onClick={reintentar}>
        Otra vez
      </button>
      <ul aria-live="polite">
        <li>
          Estado: <b data-prueba="fase">{estado.fase}</b>
        </li>
        <li>
          Verificación: <span data-prueba="etapa">{estado.verificacion?.etapa ?? ""}</span>
        </li>
        <li>
          NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
        </li>
        <li>
          Confiable: <span data-prueba="confiable">{String(estado.resultado?.confiable ?? "")}</span>
        </li>
        <li>
          Rechazo: <span data-prueba="rechazo">{estado.rechazo?.motivo ?? ""}</span>
        </li>
        <li>
          Etapas: <span data-prueba="etapas">{etapas.join(",")}</span>
        </li>
      </ul>
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
