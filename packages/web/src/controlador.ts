/**
 * Controlador del núcleo headless (SDK-27 a SDK-30, SDK-37, SDK-38). Conecta la máquina pura con `DependenciasLector`
 * (inyectables; por omisión `dependencias.ts`, que se importa dinámicamente en `iniciar` para no tocar globals al
 * importar ni contar en el presupuesto inicial). Nunca crea elementos ni estilos: solo usa el `video` recibido.
 */
import { clasificarErrorCamara, crearAutocaptura, UMBRALES_POR_DEFECTO, type ResultadoLectura } from "@lector-cedula/capture";
import { enviarCaptura } from "./envio.js";
import { congelar, ESTADO_INICIAL } from "./estado.js";
import { contenidoDePista, transicion, type EventoLector } from "./maquina.js";
import { aPresentacion } from "./presentacion.js";
import { marcarInicioLectura, medirLectura } from "./medidas.js";
import { mensaje } from "./mensajes.js";
import { opcionInvalida } from "./opciones.js";
import { crearReintentos } from "./reintentos.js";
import type {
  CalidadInyectada,
  CamaraLector,
  CapturaLector,
  CodigoError,
  ContenidoLector,
  ControladorLector,
  DependenciasLector,
  ErrorLector,
  EstadoLector,
  FrameCalidad,
  LectorInyectado,
  OpcionesLector,
} from "./tipos.js";

const CAMARA: Readonly<Record<string, CodigoError>> = {
  "permiso-denegado": "camara-denegada",
  "sin-camara": "camara-no-disponible",
  "camara-ocupada": "camara-ocupada",
};

/** Código público de un rechazo al abrir la cámara o cargar el motor. */
export function codigoErrorInicio(e: unknown): CodigoError {
  const codigo = typeof e === "object" && e !== null ? (e as { codigo?: unknown }).codigo : undefined;
  if (codigo === "motor-no-disponible" || codigo === "entorno-no-soportado") return codigo;
  return CAMARA[clasificarErrorCamara(e).codigo] ?? "camara-error";
}

/** Código público de una lectura fallida. */
export function codigoErrorLectura(r: Extract<ResultadoLectura, { ok: false }>): CodigoError {
  switch (r.error) {
    case "motor":
    case "modelo-no-disponible":
    case "lector-terminado":
      return "motor-no-disponible";
    case "menor-de-edad":
    case "ti-mayor-de-edad":
      return "menor-de-edad";
    case "documento-no-admitido":
      return "documento-no-admitido";
    default:
      return "lectura-fallida";
  }
}

const FUENTES: ReadonlySet<string> = new Set(["pdf417", "mrz-td1", "mrz-td3"]);

export function crearLector(opciones: OpcionesLector = {}, deps?: DependenciasLector): ControladorLector {
  const invalida = opcionInvalida(opciones);
  const idioma = !invalida && opciones.idioma === "en" ? "en" : "es";
  const error = (codigo: CodigoError, extra: { opcion?: string } = {}): ErrorLector => ({ codigo, mensaje: mensaje(codigo, idioma), ...extra });
  let estado: EstadoLector = invalida === null ? ESTADO_INICIAL : congelar({ ...ESTADO_INICIAL, fase: "error", error: error("opcion-invalida", { opcion: invalida }) });
  const suscriptores = new Set<(e: EstadoLector) => void>();
  const conEnvio = invalida === null && opciones.servidor !== undefined && opciones.sesion !== undefined;

  let d: DependenciasLector | null = deps ?? null;
  let destruido = false;
  let generacion = 0;
  let video: HTMLVideoElement | null = null;
  let camara: CamaraLector | null = null;
  let calidad: CalidadInyectada | null = null;
  let lector: LectorInyectado | null = null;
  let captura: CapturaLector | null = null;
  let lectura: AbortController | null = null;
  let pararBucle: (() => void) | null = null;
  const autocaptura = crearAutocaptura(UMBRALES_POR_DEFECTO);
  const reintentos = crearReintentos(() => d?.ahora() ?? 0);

  function emitir(ev: EventoLector): void {
    if (destruido) return;
    const siguiente = transicion(estado, ev);
    if (siguiente === estado) return;
    estado = siguiente;
    for (const fn of [...suscriptores]) {
      try {
        fn(siguiente);
      } catch {
        // Un suscriptor que lanza no rompe a los demás ni al lector.
      }
    }
  }

  function detenerCamara(): void {
    pararBucle?.();
    pararBucle = null;
    camara?.detener();
    camara = null;
    if (video !== null) {
      try {
        video.srcObject = null;
      } catch {
        // Vídeo falso o sin `srcObject`.
      }
    }
  }

  function liberarTodo(terminarWorkers: boolean): void {
    generacion++;
    lectura?.abort();
    lectura = null;
    detenerCamara();
    captura?.liberar();
    captura = null;
    autocaptura.reiniciar();
    if (terminarWorkers) {
      calidad?.terminar();
      calidad = null;
      lector?.terminar();
      lector = null;
    }
  }

  async function dependencias(): Promise<DependenciasLector> {
    if (d === null) {
      const m = await import("./dependencias.js");
      d = m.crearDependencias(opciones);
    }
    return d;
  }

  /** Abre la cámara; `false` si falló o si la generación cambió (la cámara ya quedó detenida). */
  async function abrir(gen: number, v: HTMLVideoElement): Promise<boolean> {
    let nueva: CamaraLector;
    try {
      nueva = await (await dependencias()).abrirCamara(v);
    } catch (e) {
      if (gen === generacion) emitir({ tipo: "fallo", error: error(codigoErrorInicio(e)) });
      return false;
    }
    if (gen !== generacion || destruido) {
      nueva.detener();
      return false;
    }
    camara = nueva;
    return true;
  }

  function bucle(gen: number, v: HTMLVideoElement, deps: DependenciasLector): void {
    pararBucle = deps.programar(() => {
      void ciclo(gen, v, deps);
    });
  }

  async function ciclo(gen: number, v: HTMLVideoElement, deps: DependenciasLector): Promise<void> {
    if (gen !== generacion) return;
    calidad ??= deps.crearCalidad();
    let f: FrameCalidad | null;
    try {
      f = await calidad.analizar(v);
    } catch {
      if (gen !== generacion) return;
      liberarTodo(true);
      emitir({ tipo: "cancelar", error: error("calidad-error") });
      return;
    }
    if (gen !== generacion) return;
    if (f !== null) {
      const paso = autocaptura.registrar(f.score);
      emitir({ tipo: "calidad", frame: f, apto: f.score >= UMBRALES_POR_DEFECTO.umbralListo });
      if (paso.solicitarCaptura || f.guiada === true) {
        if (await capturar(gen, v, deps, f)) return;
        if (gen !== generacion) return;
      }
    }
    bucle(gen, v, deps);
  }

  /** `true` si la captura se aceptó (el bucle se detiene y empieza la lectura). */
  async function capturar(gen: number, v: HTMLVideoElement, deps: DependenciasLector, f: FrameCalidad): Promise<boolean> {
    const cam = camara;
    if (cam === null) return false;
    let c: CapturaLector | null;
    try {
      c = await deps.capturar(v, cam, f.contenido);
    } catch {
      c = null;
    }
    if (gen !== generacion) {
      c?.liberar();
      return false;
    }
    if (c === null) {
      autocaptura.reiniciar();
      return false;
    }
    captura = c;
    detenerCamara();
    void leer(gen, v, deps, c, contenidoDePista(c.pista));
    return true;
  }

  async function leer(gen: number, v: HTMLVideoElement, deps: DependenciasLector, c: CapturaLector, pista: ContenidoLector | null): Promise<void> {
    emitir({ tipo: "leyendo", contenido: pista });
    marcarInicioLectura();
    reintentos.iniciar();
    const control = new AbortController();
    lectura = control;
    // La imagen del envío se toma antes de leer: la lectura pone los píxeles a cero.
    const imagen = conEnvio && c.imagen !== undefined ? c.imagen().catch(() => null) : null;
    lector ??= deps.crearLector();
    let r: ResultadoLectura;
    try {
      r = await lector.leer(c, control.signal, (p) => {
        if (gen === generacion) emitir({ tipo: "progreso", valor: p });
      });
    } catch {
      r = { ok: false, error: "motor" };
    }
    c.liberar();
    if (captura === c) captura = null;
    if (gen !== generacion) return;
    lectura = null;
    if (!r.ok && r.error !== "cancelada" && reintentos.decidir(r) === "reintentar") {
      autocaptura.reiniciar();
      if (!(await abrir(gen, v))) return;
      emitir({ tipo: "reintento-automatico" });
      bucle(gen, v, deps);
      return;
    }
    reintentos.reiniciar();
    if (!r.ok) return emitir({ tipo: "fallo", error: error(codigoErrorLectura(r)) });
    if (opciones.documentos !== undefined && !opciones.documentos.includes(r.tipoDocumento)) {
      return emitir({ tipo: "fallo", error: error("documento-no-admitido") });
    }
    medirLectura();
    emitir({
      tipo: "resultado",
      resultado: aPresentacion(r),
      contenido: FUENTES.has(r.fuente) ? r.fuente : null,
      envio: conEnvio ? { estado: "enviando" } : null,
    });
    if (imagen === null) return;
    const blob = await imagen;
    if (gen !== generacion) return;
    const envio =
      blob === null
        ? ({ estado: "fallido", codigo: "subida-fallida" } as const)
        : await enviarCaptura({ servidor: opciones.servidor as string, sesion: opciones.sesion as string, imagen: blob, fetch: deps.fetch ?? globalThis.fetch.bind(globalThis) });
    if (gen === generacion) emitir({ tipo: "envio", envio });
  }

  async function arrancar(v: HTMLVideoElement): Promise<void> {
    const gen = generacion;
    let deps: DependenciasLector;
    try {
      deps = await dependencias();
    } catch {
      if (gen === generacion) emitir({ tipo: "fallo", error: error("motor-no-disponible") });
      return;
    }
    if (gen !== generacion || !(await abrir(gen, v))) {
      // Cancelado mientras se pedía el permiso: permiso -> activo -> inicio (transiciones permitidas).
      if (gen !== generacion && !destruido && estado.fase === "permiso" && cancelado === gen) {
        emitir({ tipo: "camara-lista" });
        emitir({ tipo: "cancelar" });
      }
      return;
    }
    emitir({ tipo: "camara-lista" });
    bucle(gen, v, deps);
  }

  let cancelado = -1;

  return {
    async iniciar(v) {
      if (destruido || invalida !== null || estado.fase !== "inicio") return;
      video = v;
      reintentos.reiniciar();
      emitir({ tipo: "iniciar" });
      await arrancar(v);
    },
    cancelar() {
      if (destruido) return;
      cancelado = generacion;
      reintentos.reiniciar();
      liberarTodo(true);
      emitir({ tipo: "cancelar" });
    },
    reintentar() {
      if (destruido || invalida !== null || (estado.fase !== "resultado" && estado.fase !== "error") || video === null) return;
      liberarTodo(false);
      reintentos.reiniciar();
      emitir({ tipo: "reintentar" });
      void arrancar(video);
    },
    destruir() {
      if (destruido) return;
      liberarTodo(true);
      destruido = true;
      suscriptores.clear();
    },
    obtenerEstado: () => estado,
    suscribir(fn) {
      if (destruido) return () => undefined;
      suscriptores.add(fn);
      return () => {
        suscriptores.delete(fn);
      };
    },
  };
}
