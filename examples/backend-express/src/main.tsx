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
