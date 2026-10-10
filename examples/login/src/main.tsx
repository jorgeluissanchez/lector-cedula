// Ejemplo de login (sdk-integracion, SDK-64): la cámara vive en un recuadro pequeño dentro de una página con contenido
// propio, nunca a pantalla completa. `?recuadro=vertical` (por omisión: 260x400, cédula de pie) o `?recuadro=horizontal`
// (320x200). La guía se pinta con `estado.guiaEnPantalla` (px CSS relativos al <video>). Sin servidor; los assets del
// núcleo se copian a /lector-cedula/ al compilar. La ilustración es un dibujo propio, sin datos ni cédulas reales.
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { EstadoLector } from "@lector-cedula/web";
import { useLectorCedula } from "@lector-cedula/react";

const RECURSOS = new URL("/lector-cedula/", location.href).href;
const RECUADROS = {
  vertical: { ancho: 260, alto: 400, orientacion: "vertical" },
  horizontal: { ancho: 320, alto: 200, orientacion: "horizontal" },
} as const;
type Recuadro = keyof typeof RECUADROS;

function recuadroDeUrl(): Recuadro {
  return new URLSearchParams(location.search).get("recuadro") === "horizontal" ? "horizontal" : "vertical";
}

/** Dibujo sintético de una tarjeta genérica (rectángulos y barras), sin datos. */
function Ilustracion({ dePie }: { dePie: boolean }) {
  return (
    <svg className="ilustracion" viewBox="0 0 160 160" role="img" aria-label={dePie ? "Dibujo: tarjeta de pie dentro del recuadro" : "Dibujo: tarjeta acostada dentro del recuadro"}>
      <g transform={dePie ? "rotate(90 80 80)" : undefined}>
        <rect x="16" y="45" width="128" height="80" rx="8" fill="#fff6d6" stroke="#6b5b2e" strokeWidth="3" />
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={28 + i * 7} y="62" width={i % 3 === 0 ? 4 : 2} height="46" fill="#3a3320" />
        ))}
      </g>
    </svg>
  );
}

function Guia({ estado }: { estado: EstadoLector }) {
  const g = estado.guiaEnPantalla;
  const visible = g !== null && (estado.fase === "activo" || estado.fase === "listo");
  return (
    <div
      data-prueba="guia"
      className={`guia${estado.fase === "listo" ? " lista" : ""}`}
      aria-hidden="true"
      style={visible ? { display: "block", left: `${g.x}px`, top: `${g.y}px`, width: `${g.ancho}px`, height: `${g.alto}px` } : { display: "none" }}
    />
  );
}

function App() {
  const recuadro = recuadroDeUrl();
  const r = RECUADROS[recuadro];
  const opciones = useMemo(() => ({ recursos: RECURSOS, guia: { orientacion: r.orientacion } }), [r.orientacion]);
  const { videoRef, estado, iniciar, cancelar, reintentar } = useLectorCedula(opciones);
  const dePie = r.orientacion === "vertical";
  // Ley 1581 de 2012, art. 9: el integrador MUST obtener la autorización expresa del titular antes de `iniciar()`.
  // La casilla empieza sin marcar y el botón de escaneo solo se habilita al marcarla. El texto es una plantilla: cada
  // integrador pone el suyo y enlaza su política de tratamiento de datos.
  const [autorizado, setAutorizado] = useState(false);
  return (
    <div className="pagina">
      <header className="barra">
        <span className="marca">Banco de Ejemplo</span>
        <nav aria-label="Recuadro">
          <a href="?recuadro=vertical" aria-current={recuadro === "vertical" ? "page" : undefined}>
            Recuadro vertical
          </a>
          <a href="?recuadro=horizontal" aria-current={recuadro === "horizontal" ? "page" : undefined}>
            Recuadro horizontal
          </a>
        </nav>
      </header>
      <main className="login">
        <section className="indicaciones" aria-labelledby="titulo">
          <h1 id="titulo">Ingresa con tu cédula</h1>
          <Ilustracion dePie={dePie} />
          <ol>
            <li>{dePie ? "Sostén la cédula de pie, sin girar el teléfono." : "Sostén la cédula acostada."}</li>
            <li>Ubícala dentro del marco del recuadro de la cámara.</li>
            <li>Espera a que el marco cambie de color; la lectura es automática.</li>
          </ol>
          <label>
            Correo
            <input type="email" name="correo" autoComplete="email" />
          </label>
        </section>
        <section className="camara" aria-label="Cámara">
          <div className="recuadro" data-prueba="recuadro" style={{ width: `${r.ancho}px`, height: `${r.alto}px` }}>
            <video ref={videoRef} data-prueba="video" playsInline muted aria-label="Vista de la cámara" />
            <Guia estado={estado} />
          </div>
          <label className="autorizacion">
            <input type="checkbox" data-prueba="autorizacion" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} />
            <span>
              Autorizo el tratamiento de los datos de mi cédula para verificar mi identidad, según la política de tratamiento de datos de
              [nombre del integrador].
            </span>
          </label>
          <div className="acciones">
            <button type="button" data-prueba="iniciar" disabled={!autorizado} onClick={() => void iniciar()}>
              Escanear cédula
            </button>
            <button type="button" data-prueba="cancelar" onClick={cancelar}>
              Detener
            </button>
            <button type="button" data-prueba="reintentar" onClick={reintentar}>
              Otra vez
            </button>
          </div>
          <ul aria-live="polite" className="estado">
            <li>
              Estado: <b data-prueba="fase">{estado.fase}</b>
            </li>
            <li>
              Contenido: <span data-prueba="contenido">{estado.contenido ?? ""}</span>
            </li>
            {/* Solo para las pruebas del ejemplo: en producción no se pinta ni se registra el NUIP. */}
            <li>
              NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
            </li>
            <li>
              Error: <span data-prueba="error">{estado.error?.codigo ?? ""}</span>
            </li>
          </ul>
        </section>
      </main>
      <footer className="pie">
        <p>Contenido del integrador alrededor del lector. Ejemplo con datos sintéticos; no envía nada a ningún servidor.</p>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
