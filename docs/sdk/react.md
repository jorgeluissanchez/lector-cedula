# React

`@lector-cedula/react` expone `useLectorCedula(opciones, avanzado?)` sobre `useSyncExternalStore`. Devuelve `{ videoRef, estado, iniciar, cancelar, reintentar }`. Sin UI ni estilos; SSR-safe (en el servidor el estado es `ESTADO_INICIAL`, fase `inicio`). El controlador se crea en `useEffect`, se recrea solo si cambian las opciones (por valor) y se destruye al desmontar.

```sh
npm install @lector-cedula/web @lector-cedula/react
```

## Con backend propio (recomendado)

<!-- ejemplo: examples/backend-express/src/main.tsx -->
```tsx
// Front React del ejemplo con backend propio (SDK-51): `backend: "/api/cedula"` del mismo origen y `autoIniciar`. El
// modo se puede elegir con `?modo=front|back|front-back`, `?validacion=estricta|auto` y `?streaming=0` (E2E de los modos, B.7).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useLectorCedula } from "@lector-cedula/react";

const RECURSOS = new URL("/lector-cedula/", location.href).href;
const parametros = new URLSearchParams(location.search);
const modo = (parametros.get("modo") ?? "front-back") as "front" | "back" | "front-back";
const validacion = parametros.get("validacion") as "estricta" | "auto" | null;
const streaming = parametros.get("streaming") !== "0";

function App() {
  const { videoRef, estado, reintentar } = useLectorCedula({
    recursos: RECURSOS,
    backend: "/api/cedula",
    modo,
    ...(modo === "front-back" && validacion ? { validacion } : {}),
    streaming,
    autoIniciar: true,
  });
  return (
    <main>
      <h1>Verifica tu identidad</h1>
      <video ref={videoRef} playsInline muted aria-label="Cámara" />
      <button type="button" data-prueba="reintentar" onClick={reintentar}>
        Otra vez
      </button>
      <ul aria-live="polite">
        <li>
          Estado: <b data-prueba="fase">{estado.fase}</b>
        </li>
        <li>
          NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
        </li>
        <li>
          Confiable: <span data-prueba="confiable">{String(estado.resultado?.confiable ?? "")}</span>
        </li>
        <li>
          Error: <span data-prueba="error">{estado.error?.codigo ?? ""}</span>
        </li>
      </ul>
    </main>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- `autoIniciar: true` abre la cámara al vincular `videoRef`. Sin él, llama `iniciar()` desde un botón.
- Muestra `estado.verificacion?.etapa` mientras `estado.fase === "verificando"` y `estado.rechazo?.motivo` si el back rechaza (el núcleo reintenta solo hasta `intentosVerificacion`).

## Solo en el navegador (modo `front`)

<!-- ejemplo: examples/react/src/main.tsx -->
```tsx
// Ejemplo React (SDK-12, SDK-31, SDK-37): UI propia sobre useLectorCedula, sin servidor. Los assets del núcleo se copian
// a /lector-cedula/ al compilar (../copiar-recursos.mjs).
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { precargarMotor, type EstadoLector } from "@lector-cedula/web";
import { useLectorCedula } from "@lector-cedula/react";

const RECURSOS = new URL("/lector-cedula/", location.href).href;

function Guia({ estado }: { estado: EstadoLector }) {
  const n = estado.guia?.normalizada;
  const visible = n !== undefined && (estado.fase === "activo" || estado.fase === "listo");
  return (
    <div
      data-prueba="guia"
      className="guia"
      style={visible ? { display: "block", left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: `${n.ancho * 100}%`, height: `${n.alto * 100}%` } : { display: "none" }}
    />
  );
}

function App() {
  const { videoRef, estado, iniciar, cancelar, reintentar } = useLectorCedula({ recursos: RECURSOS });
  const [motor, fijarMotor] = useState("");
  const precargar = (): void => {
    fijarMotor("cargando");
    precargarMotor({ recursos: RECURSOS }).then(
      () => fijarMotor("listo"),
      (e: { codigo?: string }) => fijarMotor(e.codigo ?? "error"),
    );
  };
  return (
    <main>
      <header>
        <h1>Verifica tu identidad</h1>
        <p>Ejemplo React headless: esta interfaz es del integrador.</p>
      </header>
      <section className="visor">
        <video ref={videoRef} playsInline muted />
        <Guia estado={estado} />
      </section>
      <nav>
        <button type="button" data-prueba="iniciar" onClick={() => void iniciar()}>
          Escanear cédula
        </button>
        <button type="button" data-prueba="precargar" onClick={precargar}>
          Preparar lector
        </button>
        <button type="button" data-prueba="cancelar" onClick={cancelar}>
          Detener
        </button>
        <button type="button" data-prueba="reintentar" onClick={reintentar}>
          Otra vez
        </button>
      </nav>
      <ul aria-live="polite">
        <li>
          Estado: <b data-prueba="fase">{estado.fase}</b>
        </li>
        <li>
          Contenido: <span data-prueba="contenido">{estado.contenido ?? ""}</span>
        </li>
        <li>
          NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
        </li>
        <li>
          Error: <span data-prueba="error">{estado.error?.codigo ?? ""}</span>
        </li>
        <li>
          Motor: <span data-prueba="motor">{motor}</span>
        </li>
      </ul>
    </main>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

## Vite: recursos y service worker

Copia los recursos con `examples/copiar-recursos.mjs` a `public/lector-cedula/` y pásalos en `recursos`. Para funcionar sin red registra un service worker con `precacheLector` (ver [vanilla.md](vanilla.md#service-worker)). `precargarMotor({ recursos })` descarga y verifica el motor sin pedir la cámara.

## Estado

`estado.fase`: `inicio`, `permiso`, `activo`, `listo`, `leyendo`, `verificando`, `resultado`, `error`. Además `calidad`, `guia`, `guiaEnPantalla`, `contenido`, `progreso`, `resultado`, `error`, `verificacion`, `rechazo`, `intentosVerificacion`, `modo`, `validacion`, `frontActivo`, `modoMotivo`. Ver [personalizacion.md](personalizacion.md).
