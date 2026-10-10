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
