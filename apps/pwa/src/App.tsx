// Pantallas de la PWA (design.md, decisiones 8 y 9): `inicio`, `activo`, `pausado`, `listo` y `error`.
import { calcularGuia, guiaEnPantalla, TEXTOS_ENTORNO, TEXTOS_ERROR_CAMARA, type Caja } from "@lector-cedula/capture";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { ESTADO_INICIAL, reducir, type CodigoError } from "./estado";
import { crearSesion } from "./sesion";

const TEXTOS_ERROR: Readonly<Record<CodigoError, string>> = { ...TEXTOS_ERROR_CAMARA, ...TEXTOS_ENTORNO };

function Boton(props: { texto: string; alPulsar: () => void; secundario?: boolean }) {
  return (
    <button type="button" class={props.secundario ? "boton secundario" : "boton"} onClick={props.alPulsar}>
      {props.texto}
    </button>
  );
}

/** Guía decorativa (CAM-08, CAM-09) sobre el vídeo mostrado con `object-fit: contain`. */
function Guia(props: { video: HTMLVideoElement | null }) {
  const [caja, setCaja] = useState<Caja | null>(null);
  useEffect(() => {
    const v = props.video;
    if (v === null) return;
    const medir = () => {
      if (v.videoWidth === 0) return;
      setCaja(guiaEnPantalla(calcularGuia(v.videoWidth, v.videoHeight), v.videoWidth, v.videoHeight, v.clientWidth, v.clientHeight));
    };
    medir();
    v.addEventListener("loadedmetadata", medir);
    v.addEventListener("resize", medir);
    window.addEventListener("resize", medir);
    return () => {
      v.removeEventListener("loadedmetadata", medir);
      v.removeEventListener("resize", medir);
      window.removeEventListener("resize", medir);
    };
  }, [props.video]);
  if (caja === null) return null;
  return <div class="guia" aria-hidden="true" style={{ left: `${caja.x}px`, top: `${caja.y}px`, width: `${caja.ancho}px`, height: `${caja.alto}px` }} />;
}

export function App() {
  const [estado, despachar] = useReducer(reducir, ESTADO_INICIAL);
  const [feedback, setFeedback] = useState("");
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const sesion = useMemo(() => crearSesion({ evento: despachar, feedback: setFeedback }), []);
  const pantallaRef = useRef(estado.pantalla);
  pantallaRef.current = estado.pantalla;

  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === "hidden" && (pantallaRef.current === "activo" || pantallaRef.current === "listo")) sesion.ocultar();
    };
    const alSalir = () => sesion.ocultar();
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", alSalir);
    return () => {
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pagehide", alSalir);
    };
  }, [sesion]);

  const refVideo = useCallback(
    (v: HTMLVideoElement | null) => {
      setVideo(v);
      sesion.conectarVideo(v);
    },
    [sesion],
  );
  const iniciar = () => void sesion.iniciar();
  const cancelar = () => sesion.cancelar();

  const p = estado.pantalla;
  const textoEstado =
    p === "activo" ? feedback : p === "listo" ? "Listo" : p === "pausado" ? "Cámara en pausa" : p === "error" ? TEXTOS_ERROR[estado.codigo] : "";

  return (
    <main class="pantalla" data-pantalla={p} data-error={p === "error" ? estado.codigo : undefined}>
      {p === "activo" && (
        <div class="escena">
          <video ref={refVideo} class="video" autoplay playsInline muted />
          <Guia video={video} />
        </div>
      )}
      <div class="panel">
        {p === "inicio" && (
          <>
            <h1>Lector de cédula</h1>
            <p>Ubica la cédula frente a la cámara trasera. La imagen no sale de tu dispositivo.</p>
          </>
        )}
        <p class="estado" role="status" aria-live="polite">
          {textoEstado}
        </p>
        {estado.aviso !== null && p === "activo" && <p class="aviso">{estado.aviso}</p>}
        <div class="acciones">
          {p === "inicio" && <Boton texto="Iniciar cámara" alPulsar={iniciar} />}
          {p === "activo" && <Boton texto="Cancelar" alPulsar={cancelar} secundario />}
          {p === "pausado" && (
            <>
              <Boton texto="Continuar" alPulsar={iniciar} />
              <Boton texto="Cancelar" alPulsar={cancelar} secundario />
            </>
          )}
          {p === "listo" && (
            <>
              <Boton texto="Repetir" alPulsar={iniciar} />
              <Boton texto="Cancelar" alPulsar={cancelar} secundario />
            </>
          )}
          {p === "error" && (
            <>
              <Boton texto="Reintentar" alPulsar={iniciar} />
              <Boton texto="Cancelar" alPulsar={cancelar} secundario />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
