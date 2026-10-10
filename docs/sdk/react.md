# React

`@lector-cedula/react` expone `useLectorCedula(opciones, avanzado?)` sobre `useSyncExternalStore`. Devuelve `{ videoRef, estado, iniciar, cancelar, reintentar }`. Sin UI ni estilos; SSR-safe (en el servidor el estado es `ESTADO_INICIAL`, fase `inicio`). El controlador se crea en `useEffect`, se recrea solo si cambian las opciones (por valor) y se destruye al desmontar.

```sh
npm install @lector-cedula/web @lector-cedula/react
```

## Con backend propio (recomendado)

<!-- ejemplo: examples/backend-express/src/main.tsx -->
```tsx
// Front React del ejemplo con backend propio (SDK-51): `backend: "/api/cedula"` del mismo origen y `autoIniciar`. La UI
// muestra la fase, la etapa de la verificación (y las etapas vistas), el rechazo y si el resultado es confiable.
// Parámetros de la URL para los E2E de los modos (B.7, SDK-60): `?modo=front|back|front-back`,
// `?validacion=estricta|auto`, `?streaming=0` y `?autoIniciar=0` (la cámara se abre con el botón "Empezar").
// Ley 1581 de 2012, art. 9 (SDK-51): la cámara no se abre hasta marcar la casilla de autorización del titular, que empieza
// sin marcar; "Empezar" está deshabilitado hasta entonces y `autoIniciar` solo actúa ya autorizado. El texto es una
// plantilla: en producción el lector va detrás de la autorización que la empresa obtiene y conserva con su política.
import { StrictMode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { crearLector, type ControladorLector, type OpcionesLector, type DependenciasLector } from "@lector-cedula/web";
import { useLectorCedula } from "@lector-cedula/react";

const RECURSOS = new URL("/lector-cedula/", location.href).href;
const parametros = new URLSearchParams(location.search);
const modo = (parametros.get("modo") ?? "front-back") as "front" | "back" | "front-back";
const validacion = parametros.get("validacion") as "estricta" | "auto" | null;
const streaming = parametros.get("streaming") !== "0";
const autoIniciar = parametros.get("autoIniciar") !== "0";

/** Historial sin repeticiones consecutivas: cada estado del núcleo se observa con `suscribir` (sin perder etapas). */
function useHistorial() {
  const [etapas, fijarEtapas] = useState<string[]>([]);
  const [fases, fijarFases] = useState<string[]>([]);
  const actual = useRef<ControladorLector | null>(null);
  const crear = useMemo(
    () => (opciones: OpcionesLector, deps?: DependenciasLector): ControladorLector => {
      const c = crearLector(opciones, deps);
      // Solo cuenta el último controlador (StrictMode crea y destruye uno antes).
      actual.current = c;
      fijarEtapas([]);
      fijarFases([]);
      const anotar = (fijar: typeof fijarEtapas, valor: string | undefined) => {
        if (valor !== undefined) fijar((l) => (l.at(-1) === valor ? l : [...l, valor]));
      };
      c.suscribir(() => {
        if (actual.current !== c) return;
        const e = c.obtenerEstado();
        anotar(fijarFases, e.fase);
        anotar(fijarEtapas, e.verificacion?.etapa);
      });
      return c;
    },
    [],
  );
  return { etapas, fases, crear };
}

function App() {
  const { etapas, fases, crear } = useHistorial();
  const [autorizado, fijarAutorizado] = useState(false);
  const { videoRef, estado, iniciar, reintentar } = useLectorCedula(
    {
      recursos: RECURSOS,
      backend: "/api/cedula",
      modo,
      ...(modo === "front-back" && validacion ? { validacion } : {}),
      streaming,
      autoIniciar: autoIniciar && autorizado,
    },
    { crear },
  );
  return (
    <main>
      <h1>Verifica tu identidad</h1>
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
          Error: <span data-prueba="error">{estado.error?.codigo ?? ""}</span>
        </li>
      </ul>
      <details>
        <summary>Detalles</summary>
        <ul>
          <li>
            Modo: <span data-prueba="modo">{estado.modo ?? ""}</span>
          </li>
          <li>
            Lectura en el dispositivo: <span data-prueba="front-activo">{String(estado.frontActivo ?? "")}</span>
          </li>
          <li>
            Etapas: <span data-prueba="etapas">{etapas.join(",")}</span>
          </li>
          <li>
            Fases: <span data-prueba="fases">{fases.join(",")}</span>
          </li>
        </ul>
      </details>
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
