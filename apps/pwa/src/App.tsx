// Pantallas de la PWA (design.md, decisiones 8 y 9): `inicio`, `activo`, `pausado`, `listo` y `error`; y las de lectura
// (pwa-lectura-offline, OFF-09, OFF-13, OFF-14, OFF-18, OFF-19): `leyendo`, `resultado` y `error-lectura`.
import { calcularGuia, guiaEnPantalla, TEXTOS_ENTORNO, TEXTOS_ERROR_CAMARA, TEXTOS_ERROR_LECTURA, type Caja } from "@lector-cedula/capture";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { diagnosticoActivo, lineasDiagnostico, type Diagnostico } from "./diagnostico";
import { ESTADO_INICIAL, reducir, type CodigoError } from "./estado";
import { iniciarIndicador, TEXTOS_OFFLINE, type EstadoOffline } from "./precache/indicador";
import { fragmentos, RUTA_AUTORIZACION_TI, RUTA_POLITICA, RUTA_TERMINOS, TEXTO_ALCANCE, TEXTO_CASILLA_REPRESENTANTE, type Bloque } from "./legal";
import { LICENCIA_CC_BY_SA, RUTA_AVISOS, SECCIONES_LICENCIAS, TEXTO_ENLACE_FUENTES } from "./licencias";
import { fraudeActivo, MOTIVOS_RIESGO } from "./fraude";
import { camposVisibles, tituloResultado } from "./resultado";
import { crearSesion } from "./sesion";

/** deteccion-fraude (FRA-17, FRA-20): la señal informa; no oculta ni bloquea los datos leídos. */
const TEXTOS_RIESGO: Readonly<Record<string, string>> = {
  bajo: "Riesgo bajo",
  medio: "Riesgo medio: revisa el documento físico",
  alto: "Riesgo alto: revisa el documento físico",
  "no-disponible": "Señal de riesgo no disponible",
};
const TEXTO_AUTENTICIDAD = "Es una señal orientativa calculada en tu dispositivo; la autenticidad solo la confirma la Registraduría.";

const TEXTOS_ERROR: Readonly<Record<CodigoError, string>> = { ...TEXTOS_ERROR_CAMARA, ...TEXTOS_ENTORNO };

/** CAM-10 y OFF-11: al ocultarse la página se detiene la cámara o se descarta la lectura y su resultado. */
const PANTALLAS_OCULTABLES: ReadonlySet<string> = new Set(["activo", "listo", "leyendo", "autorizacion-representante", "resultado", "error-lectura"]);

export const TEXTO_LEYENDO = "Leyendo documento…";

/** OFF-21: textos extraídos de docs/legal en la compilación (vite.config.ts). */
declare const __TEXTOS_LEGALES__: { readonly aviso: readonly Bloque[]; readonly autorizacion: string; readonly descargo: string };
const LEGAL = __TEXTOS_LEGALES__;
/** otros-documentos (OD-30, OD-34b, OD-35): parámetro de la TI y texto de la autorización, validados al compilar. */
declare const __ADMITIR_TI__: boolean;
declare const __AUTORIZACION_TI__: readonly Bloque[] | null;
const ADMITIR_TI = __ADMITIR_TI__;
/** mitigacion-autor (MA-02): VITE_DEMO, validado al compilar. */
declare const __DEMO__: boolean;
export const TEXTO_DEMO =
  "Demostración del software libre lector-cedula. No uses tu cédula real ni datos de terceros; usa un documento de prueba. Nada se guarda ni se envía: la lectura ocurre en tu dispositivo.";
const AUTORIZACION_TI = __AUTORIZACION_TI__;
export const TEXTO_AUTORIZACION_PENDIENTE = "Se necesita la autorización del representante legal";
const TEXTO_ENLACE_AUTORIZACION_TI = "Autorización del representante legal";

function Texto(props: { texto: string }) {
  return <>{fragmentos(props.texto).map((f, i) => (f.fuerte ? <strong key={i}>{f.texto}</strong> : f.texto))}</>;
}

function BloquesAviso(props: { bloques: readonly Bloque[] }) {
  const salida = [];
  let items: string[] = [];
  const volcar = () => {
    if (items.length > 0) salida.push(<ul key={`l${salida.length}`}>{items.map((t) => <li key={t}><Texto texto={t} /></li>)}</ul>);
    items = [];
  };
  for (const b of props.bloques) {
    if (b.tipo === "item") {
      items.push(b.texto);
      continue;
    }
    volcar();
    const k = `${b.tipo}${salida.length}`;
    if (b.tipo === "titulo") salida.push(<h2 key={k}><Texto texto={b.texto} /></h2>);
    else if (b.tipo === "cita") salida.push(<p key={k} class="descargo"><Texto texto={b.texto} /></p>);
    else salida.push(<p key={k}><Texto texto={b.texto} /></p>);
  }
  volcar();
  return <>{salida}</>;
}

function Boton(props: { texto: string; alPulsar: () => void; secundario?: boolean; deshabilitado?: boolean }) {
  return (
    <button type="button" class={props.secundario ? "boton secundario" : "boton"} onClick={props.alPulsar} disabled={props.deshabilitado === true}>
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
  // OFF-29: diagnóstico solo con ?debug=1, en memoria (números y códigos).
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const depurar = useMemo(() => diagnosticoActivo(location.search), []);
  const sesion = useMemo(
    () =>
      crearSesion(
        { evento: despachar, feedback: setFeedback, ...(depurar ? { diagnostico: setDiagnostico } : {}) },
        { fraude: fraudeActivo(import.meta.env.VITE_FRAUDE as string | undefined, location.search), admitirTarjetaIdentidad: ADMITIR_TI },
      ),
    [depurar],
  );
  const [offline, setOffline] = useState<EstadoOffline>("pendiente");
  // OFF-21: la autorización vive solo en memoria de la página; nunca se guarda (OFF-11).
  const [autorizado, setAutorizado] = useState(false);
  // OD-34b: casilla del representante, sin marcar cada vez que se entra en la pantalla; solo en memoria.
  const [representante, setRepresentante] = useState(false);
  useEffect(() => {
    if (estado.pantalla === "autorizacion-representante") setRepresentante(false);
  }, [estado.pantalla]);
  const pantallaRef = useRef(estado.pantalla);
  // OFF-23: segundos transcurridos en `leyendo` (fuera de la región aria-live para no repetir anuncios).
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (estado.pantalla !== "leyendo") return;
    setSegundos(0);
    const inicio = Date.now();
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 500);
    return () => clearInterval(t);
  }, [estado.pantalla]);

  // CAM-01, OFF-03 y OFF-16: registro del service worker tras comprobar la cuota (solo en producción; en desarrollo no
  // existe sw.js) e indicador de disponibilidad sin conexión.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    void iniciarIndicador({ serviceWorker: sw, storage: navigator.storage }, setOffline);
  }, []);
  pantallaRef.current = estado.pantalla;

  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === "hidden" && PANTALLAS_OCULTABLES.has(pantallaRef.current)) sesion.ocultar();
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
  const cancelarLectura = () => void sesion.cancelarLectura();
  const abrirLicencias = (e?: Event) => {
    e?.preventDefault();
    despachar({ tipo: "licencias" });
  };
  const volver = () => despachar({ tipo: "volver" });
  const autorizar = () => despachar({ tipo: "autorizar" });

  const p = estado.pantalla;
  const textoEstado =
    p === "activo" ? feedback : p === "listo" ? "Listo" : p === "pausado" ? "Cámara en pausa" : p === "error"
            ? TEXTOS_ERROR[estado.codigo]
            : p === "leyendo"
              ? TEXTO_LEYENDO
              : p === "error-lectura"
                ? TEXTOS_ERROR_LECTURA[estado.errorLectura]
                : p === "resultado"
                  ? "Lectura completada"
                  : p === "autorizacion-representante"
                    ? TEXTO_AUTORIZACION_PENDIENTE
                    : "";

  return (
    <main
      class="pantalla"
      data-pantalla={p}
      data-error={p === "error" ? estado.codigo : p === "error-lectura" ? estado.errorLectura : undefined}
      data-tipo={p === "resultado" ? estado.lectura.tipo : undefined}
      data-tipo-documento={p === "resultado" ? estado.lectura.tipoDocumento : undefined}
    >
      {p === "activo" && (
        <div class="escena">
          <video ref={refVideo} class="video" autoplay playsInline muted />
          <Guia video={video} />
        </div>
      )}
      <div class="panel">
        {p === "inicio" && __DEMO__ && (
          <section class="aviso-demo" role="note" aria-label="Aviso de demostración">
            <p>{TEXTO_DEMO}</p>
          </section>
        )}
        {p === "inicio" && (
          <>
            <h1>Lector de cédula</h1>
            <p>Ubica la cédula frente a la cámara trasera. La imagen no sale de tu dispositivo.</p>
            <p class="alcance">{TEXTO_ALCANCE}</p>
            <section class="aviso-privacidad" aria-label="Aviso de privacidad">
              <BloquesAviso bloques={LEGAL.aviso} />
              <p class="enlaces-legales">
                <a class="enlace" href={RUTA_POLITICA}>
                  Política de tratamiento
                </a>
                {" · "}
                <a class="enlace" href={RUTA_TERMINOS}>
                  Términos de uso
                </a>
                {ADMITIR_TI && (
                  <>
                    {" · "}
                    <a class="enlace" href={RUTA_AUTORIZACION_TI}>
                      {TEXTO_ENLACE_AUTORIZACION_TI}
                    </a>
                  </>
                )}
              </p>
              <label class="autorizacion">
                <input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado((e.currentTarget as HTMLInputElement).checked)} />
                <span>{LEGAL.autorizacion}</span>
              </label>
            </section>
            <p class="offline" role="status" data-offline={offline}>
              {TEXTOS_OFFLINE[offline]}
            </p>
          </>
        )}
        <p class="estado" role="status" aria-live="polite">
          {textoEstado}
        </p>
        {estado.aviso !== null && p === "activo" && <p class="aviso">{estado.aviso}</p>}
        {p === "leyendo" && (
          <div class="progreso">
            <progress aria-label="Progreso de la lectura" />
            <span data-segundos={segundos}>{segundos} s</span>
          </div>
        )}
        {p === "licencias" && (
          <section class="licencias" aria-labelledby="titulo-licencias">
            <h1 id="titulo-licencias">Acerca de y licencias</h1>
            {SECCIONES_LICENCIAS.map((sec) => (
              <section key={sec.titulo} aria-label={sec.titulo}>
                <h2>{sec.titulo}</h2>
                {sec.parrafos.map((t) => (
                  <p key={t}>{t}</p>
                ))}
                {sec.fuente !== undefined && (
                  <p>
                    Fuente: <a class="enlace" href={sec.fuente} rel="noopener noreferrer" target="_blank">{sec.fuente}</a>
                  </p>
                )}
              </section>
            ))}
            <p>
              <a class="enlace" href={LICENCIA_CC_BY_SA} rel="noopener noreferrer" target="_blank">
                Licencia CC BY-SA 4.0 (texto legal)
              </a>
            </p>
            <p>
              <a class="enlace" href={RUTA_AVISOS} rel="noopener" target="_blank">
                Licencias de los componentes de terceros
              </a>
            </p>
          </section>
        )}
        {p === "autorizacion-representante" && (
          <section class="autorizacion-representante" aria-labelledby="titulo-autorizacion-representante">
            <h1 id="titulo-autorizacion-representante">{TEXTO_ENLACE_AUTORIZACION_TI}</h1>
            <p>El documento leído es de una persona menor de edad. Sus datos solo se muestran con la autorización expresa de su representante legal.</p>
            {AUTORIZACION_TI !== null && (
              <div class="texto-autorizacion">
                <BloquesAviso bloques={AUTORIZACION_TI} />
              </div>
            )}
            <p>
              <a class="enlace" href={RUTA_AUTORIZACION_TI} rel="noopener" target="_blank">
                {TEXTO_ENLACE_AUTORIZACION_TI} (texto completo)
              </a>
            </p>
            <label class="autorizacion">
              <input type="checkbox" checked={representante} onChange={(e) => setRepresentante((e.currentTarget as HTMLInputElement).checked)} />
              <span>{TEXTO_CASILLA_REPRESENTANTE}</span>
            </label>
          </section>
        )}
        {p === "resultado" && (
          <section
            class="resultado"
            aria-live="polite"
            aria-labelledby="titulo-resultado"
            data-riesgo-nivel={"riesgo" in estado ? (estado.riesgo?.nivel ?? "no-disponible") : undefined}
            data-riesgo-motivos={"riesgo" in estado ? (estado.riesgo?.motivos ?? []).map((m) => m.codigo).join(" ") : undefined}
          >
            <h2 id="titulo-resultado">{tituloResultado(estado.lectura).documento}</h2>
            {tituloResultado(estado.lectura).variante !== null && <p class="variante">{tituloResultado(estado.lectura).variante}</p>}
            <p class="descargo">{LEGAL.descargo}</p>
            <dl>
              {camposVisibles(estado.lectura).map((c) => (
                <div class="campo" key={c.clave}>
                  <dt id={`etiqueta-${c.clave}`}>{c.etiqueta}</dt>
                  <dd aria-labelledby={`etiqueta-${c.clave}`} data-campo={c.clave}>
                    {c.valor}
                    {c.clave === "lugarNacimiento" && (
                      <>
                        {" "}
                        <a class="enlace" href="#licencias" onClick={abrirLicencias}>
                          {TEXTO_ENLACE_FUENTES}
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {"riesgo" in estado && (
            <section class="riesgo" aria-labelledby="titulo-riesgo" data-riesgo={estado.riesgo?.nivel ?? "no-disponible"}>
              <h3 id="titulo-riesgo">{TEXTOS_RIESGO[estado.riesgo?.nivel ?? "no-disponible"]}</h3>
              {(estado.riesgo?.motivos.length ?? 0) > 0 && (
                <ul>
                  {estado.riesgo?.motivos.map((m) => (
                    <li key={m.codigo} data-motivo={m.codigo}>
                      {MOTIVOS_RIESGO[m.codigo]}
                    </li>
                  ))}
                </ul>
              )}
              <p class="nota-riesgo">{TEXTO_AUTENTICIDAD}</p>
            </section>
            )}
          </section>
        )}
        {depurar && diagnostico !== null && (p === "leyendo" || p === "resultado" || p === "error-lectura") && (
          <section class="diagnostico" aria-label="Diagnóstico" data-diagnostico="">
            <ul>
              {lineasDiagnostico(diagnostico).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        )}
        <div class="acciones">
          {p === "inicio" && (
            <>
              <Boton texto="Iniciar cámara" alPulsar={iniciar} deshabilitado={!autorizado} />
              <Boton texto="Acerca de y licencias" alPulsar={abrirLicencias} secundario />
            </>
          )}
          {p === "licencias" && <Boton texto="Volver" alPulsar={volver} />}
          {p === "activo" && <Boton texto="Cancelar" alPulsar={cancelar} secundario />}
          {p === "pausado" && (
            <>
              <Boton texto="Continuar" alPulsar={iniciar} />
              <Boton texto="Cancelar" alPulsar={cancelar} secundario />
            </>
          )}
          {p === "leyendo" && <Boton texto="Cancelar" alPulsar={cancelarLectura} secundario />}
          {p === "autorizacion-representante" && (
            <>
              <Boton texto="Continuar" alPulsar={autorizar} deshabilitado={!representante} />
              <Boton texto="Cancelar" alPulsar={cancelar} secundario />
            </>
          )}
          {p === "resultado" && <Boton texto="Leer otra" alPulsar={iniciar} />}
          {p === "error-lectura" && (
            <>
              <Boton texto="Intentar de nuevo" alPulsar={iniciar} />
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
