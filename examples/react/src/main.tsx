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
