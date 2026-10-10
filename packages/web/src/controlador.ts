/**
 * Controlador del núcleo headless (SDK-27 a SDK-30, SDK-37, SDK-38, SDK-45 a SDK-59). Conecta la máquina pura con
 * `DependenciasLector` (inyectables; por omisión `dependencias.ts`, que se importa dinámicamente en `iniciar` para no
 * tocar globals al importar ni contar en el presupuesto inicial). Nunca crea elementos ni estilos: solo usa el `video`
 * recibido. Con `backend`, el cliente del protocolo (`verificacion.ts`) también se importa dinámicamente.
 */
import { clasificarErrorCamara, crearAutocaptura, UMBRALES_POR_DEFECTO, type ResultadoLectura } from "@lector-cedula/capture";
import { decidirFront, leerDispositivo } from "./decidir-front.js";
import { enviarCaptura } from "./envio.js";
import { actualizar, congelar, ESTADO_INICIAL, normalizarGuia } from "./estado.js";
import { guiaEnElemento, guiaEnVideo } from "./pantalla.js";
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
  MedidasVideo,
  ModoLector,
  OpcionesLector,
  Rectangulo,
  ResultadoPresentacion,
  TipoDocumento,
} from "./tipos.js";
import type { DocumentoBackend } from "./verificacion.js";

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

/** Resultado de confianza a partir del `documento` del backend (SDK-46). */
export function resultadoConfiable(doc: DocumentoBackend, local: ResultadoPresentacion | null): ResultadoPresentacion {
  const tipo = typeof doc.tipo === "string" ? doc.tipo : typeof doc.tipoDocumento === "string" ? doc.tipoDocumento : (local?.tipo ?? "cedula-ciudadania");
  const warnings = Array.isArray(doc.warnings) ? doc.warnings.filter((w): w is string => typeof w === "string") : [];
  return { tipo: tipo as TipoDocumento, campos: doc.campos as unknown as ResultadoPresentacion["campos"], warnings, confiable: true, validacion_id: null };
}

/** SDK-62: medidas por omisión, solo lectura del `<video>` (nunca cambia estilos ni tamaño). */
export function medirVideoPorOmision(v: HTMLVideoElement): MedidasVideo | null {
  const anchoVideo = v.videoWidth;
  const altoVideo = v.videoHeight;
  const anchoElemento = v.clientWidth;
  const altoElemento = v.clientHeight;
  if (![anchoVideo, altoVideo, anchoElemento, altoElemento].every((n) => typeof n === "number" && n > 0)) return null;
  const estilo = typeof getComputedStyle === "function" ? getComputedStyle(v) : null;
  return { anchoVideo, altoVideo, anchoElemento, altoElemento, ajuste: estilo?.objectFit === "cover" ? "cover" : "contain" };
}

/** SDK-62: `ResizeObserver` sobre el elemento, más el evento `resize` del vídeo (cambio de orientación de la pista). */
export function observarVideoPorOmision(v: HTMLVideoElement, fn: () => void): () => void {
  const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const ro = RO === undefined ? null : new RO(() => fn());
  ro?.observe(v);
  const conEventos = typeof v.addEventListener === "function";
  if (conEventos) v.addEventListener("resize", fn);
  return () => {
    ro?.disconnect();
    if (conEventos) v.removeEventListener("resize", fn);
  };
}

const temporizarPorOmision = (fn: () => void, ms: number): (() => void) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

interface Cola {
  bytes: Uint8Array;
  readonly tipo: string;
  readonly cliente: unknown;
  parar(): void;
}

export function crearLector(entrada: OpcionesLector = {}, deps?: DependenciasLector): ControladorLector {
  const invalida = opcionInvalida(entrada);
  const opciones: OpcionesLector = invalida === null ? entrada : {};
  const idioma = !invalida && opciones.idioma === "en" ? "en" : "es";
  const error = (codigo: CodigoError, extra: { opcion?: string; causa?: CodigoError } = {}): ErrorLector => ({ codigo, mensaje: mensaje(codigo, idioma), ...extra });
  const modo: ModoLector = opciones.modo ?? (opciones.backend === undefined ? "front" : "front-back");
  const validacion = modo === "front-back" ? (opciones.validacion ?? "estricta") : null;
  const conBackend = invalida === null && modo !== "front";
  const inicial: EstadoLector = congelar({
    ...ESTADO_INICIAL,
    modo,
    validacion,
    frontActivo: modo === "front" ? true : modo === "back" ? false : validacion === "estricta" ? true : null,
    modoMotivo: modo === "front" ? "modo-front" : modo === "back" ? "modo-back" : validacion === "estricta" ? "estricta" : null,
    intentosVerificacion: conBackend ? { usados: 0, maximo: opciones.intentosVerificacion ?? 3 } : null,
  });
  let estado: EstadoLector = invalida === null ? inicial : congelar({ ...ESTADO_INICIAL, fase: "error", error: error("opcion-invalida", { opcion: invalida }) });
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
  let verificacion: AbortController | null = null;
  let cola: Cola | null = null;
  let pararBucle: (() => void) | null = null;
  let autoArranque = false;
  let medidas: MedidasVideo | null = null;
  let dejarDeObservar: (() => void) | null = null;
  let autoArranqueUsado = false;
  const autocaptura = crearAutocaptura(UMBRALES_POR_DEFECTO);
  const reintentos = crearReintentos(() => d?.ahora() ?? 0);
  const frontActivo = (): boolean => estado.frontActivo !== false;

  /** SDK-62: `guiaEnPantalla` es derivada de `guia` y de las medidas del elemento. */
  function conPantalla(e: EstadoLector): EstadoLector {
    const g = e.guia === null || medidas === null ? null : guiaEnElemento(e.guia.video, medidas);
    return actualizar(e, { guiaEnPantalla: g });
  }

  function medir(v: HTMLVideoElement): void {
    try {
      medidas = (d?.medirVideo ?? medirVideoPorOmision)(v);
    } catch {
      medidas = null;
    }
  }

  /** SDK-61: guía en píxeles del vídeo dentro de la zona visible; `null` sin medidas (las dependencias usan el frame completo). */
  function guiaActual(): Rectangulo | null {
    return medidas === null ? null : guiaEnVideo(medidas, opciones.guia);
  }

  /** SDK-62: al cambiar el tamaño del elemento o del vídeo, la guía y `guiaEnPantalla` se recalculan sin esperar un frame. */
  function alRedimensionar(v: HTMLVideoElement): void {
    if (destruido) return;
    medir(v);
    let siguiente = estado;
    const g = guiaActual();
    if (g !== null && medidas !== null && estado.guia !== null && (estado.fase === "activo" || estado.fase === "listo")) {
      siguiente = actualizar(siguiente, { guia: normalizarGuia(g, medidas.anchoVideo, medidas.altoVideo) ?? siguiente.guia });
    }
    publicar(conPantalla(siguiente));
  }

  function publicar(siguiente: EstadoLector): void {
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

  function emitir(ev: EventoLector): void {
    if (destruido) return;
    const siguiente = transicion(estado, ev);
    if (siguiente === estado) return;
    publicar(conPantalla(siguiente));
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

  /** SDK-58: la cola se pone a cero al enviar, cancelar, destruir o vencer. */
  function vaciarCola(): void {
    cola?.parar();
    cola?.bytes.fill(0);
    cola = null;
  }

  function liberarTodo(terminarWorkers: boolean): void {
    generacion++;
    lectura?.abort();
    lectura = null;
    verificacion?.abort();
    verificacion = null;
    vaciarCola();
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
      d = m.crearDependencias(opciones, { ligero: !frontActivo() });
    }
    return d;
  }

  /** Abre la cámara; `false` si falló o si la generación cambió (la cámara ya quedó detenida). */
  async function abrir(gen: number, v: HTMLVideoElement): Promise<boolean> {
    let nueva: CamaraLector;
    const automatico = autoArranque;
    autoArranque = false;
    try {
      nueva = await (await dependencias()).abrirCamara(v);
    } catch (e) {
      if (gen !== generacion) return false;
      const codigo = codigoErrorInicio(e);
      // SDK-49: el arranque automático que falla vuelve a `inicio` para que la UI muestre el botón.
      if (automatico) emitir({ tipo: "cancelar", error: error("autoinicio-fallido", { causa: codigo }) });
      else emitir({ tipo: "fallo", error: error(codigo) });
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
    medir(v);
    let f: FrameCalidad | null;
    try {
      f = await calidad.analizar(v, guiaActual());
    } catch {
      if (gen !== generacion) return;
      liberarTodo(true);
      emitir({ tipo: "fallo", error: error("calidad-error") });
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

  /** `true` si la captura se aceptó (el bucle se detiene y empieza la lectura o el envío). */
  async function capturar(gen: number, v: HTMLVideoElement, deps: DependenciasLector, f: FrameCalidad): Promise<boolean> {
    const cam = camara;
    if (cam === null) return false;
    let c: CapturaLector | null;
    try {
      c = await deps.capturar(v, cam, f.contenido, guiaActual());
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
    if (frontActivo()) void leer(gen, v, deps, c, contenidoDePista(c.pista));
    else void enviarLigero(gen, v, deps, c);
    return true;
  }

  /** SDK-56: sin motor local, la imagen va al backend sin fase `leyendo`. */
  async function enviarLigero(gen: number, v: HTMLVideoElement, deps: DependenciasLector, c: CapturaLector): Promise<void> {
    const imagen = c.imagen === undefined ? null : await c.imagen().catch(() => null);
    c.liberar();
    if (captura === c) captura = null;
    if (gen !== generacion) return;
    if (imagen === null) return emitir({ tipo: "fallo", error: error("lectura-fallida") });
    await verificarEnBackend(gen, v, deps, imagen, null, contenidoDePista(c.pista));
  }

  async function leer(gen: number, v: HTMLVideoElement, deps: DependenciasLector, c: CapturaLector, pista: ContenidoLector | null): Promise<void> {
    emitir({ tipo: "leyendo", contenido: pista });
    marcarInicioLectura();
    reintentos.iniciar();
    const control = new AbortController();
    lectura = control;
    // La imagen del envío se toma antes de leer: la lectura pone los píxeles a cero.
    const imagen = (conEnvio || conBackend) && c.imagen !== undefined ? c.imagen().catch(() => null) : null;
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
    const menor = r.tipoDocumento === "tarjeta-identidad" || (r as { menorDeEdad?: boolean }).menorDeEdad === true;
    const contenido = FUENTES.has(r.fuente) ? (r.fuente as ContenidoLector) : null;
    const local = aPresentacion(r);
    if (conBackend) {
      // SDK-53: sin `enviarMenores`, rechazo local sin red (motivo terminal, SDK-47).
      if (menor && opciones.enviarMenores !== true) return emitir({ tipo: "rechazo", rechazo: { motivo: "menor-de-edad" }, error: error("verificacion-rechazada") });
      const blob = imagen === null ? null : await imagen;
      if (gen !== generacion) return;
      if (blob === null) return emitir({ tipo: "fallo", error: error("lectura-fallida") });
      return verificarEnBackend(gen, v, deps, blob, local, contenido);
    }
    if (conEnvio && menor && opciones.enviarMenores !== true) {
      return emitir({ tipo: "resultado", resultado: local, contenido, envio: { estado: "fallido", codigo: "menor-no-enviado" } });
    }
    emitir({ tipo: "resultado", resultado: local, contenido, envio: conEnvio ? { estado: "enviando" } : null });
    if (imagen === null) return;
    const blob = await imagen;
    if (gen !== generacion) return;
    const envio =
      blob === null
        ? ({ estado: "fallido", codigo: "subida-fallida" } as const)
        : await enviarCaptura({ servidor: opciones.servidor as string, sesion: opciones.sesion as string, imagen: blob, fetch: deps.fetch ?? globalThis.fetch.bind(globalThis) });
    if (gen === generacion) emitir({ tipo: "envio", envio });
  }

  /** SDK-46, SDK-58: pasa a `verificando` y envía (o deja la imagen en la cola en memoria si no hay red). */
  async function verificarEnBackend(gen: number, v: HTMLVideoElement, deps: DependenciasLector, imagen: Blob, local: ResultadoPresentacion | null, contenido: ContenidoLector | null): Promise<void> {
    const cliente = local === null ? undefined : { tipo: local.tipo, campos: local.campos };
    const enLinea = deps.enLinea?.() ?? (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;
    if (modo === "front-back" && !enLinea) {
      emitir({ tipo: "verificar", resultado: local, contenido, verificacion: { etapa: "en-espera", progreso: null } });
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await imagen.arrayBuffer());
      } catch {
        return emitir({ tipo: "fallo", error: error("lectura-fallida") });
      }
      if (gen !== generacion) return void bytes.fill(0);
      encolar(gen, v, deps, bytes, imagen.type, cliente);
      return;
    }
    emitir({ tipo: "verificar", resultado: local, contenido, verificacion: { etapa: "recibido", progreso: null } });
    await enviarAlBackend(gen, v, deps, imagen, cliente);
  }

  function encolar(gen: number, v: HTMLVideoElement, deps: DependenciasLector, bytes: Uint8Array, tipo: string, cliente: unknown): void {
    const temporizar = deps.temporizar ?? temporizarPorOmision;
    const alConectar =
      deps.alConectar ??
      ((fn: () => void) => {
        const g = globalThis as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
        g.addEventListener?.("online", fn);
        return () => g.removeEventListener?.("online", fn);
      });
    const pararVencimiento = temporizar(() => {
      if (gen !== generacion) return;
      vaciarCola();
      emitir({ tipo: "fallo", error: error("cola-vencida") });
    }, opciones.tiempoColaMs ?? 600_000);
    const pararRed = alConectar(() => {
      const c = cola;
      if (gen !== generacion || c === null) return;
      cola = null;
      c.parar();
      const blob = new Blob([c.bytes.slice()], { type: c.tipo });
      c.bytes.fill(0);
      emitir({ tipo: "etapa", verificacion: { etapa: "recibido", progreso: null } });
      void enviarAlBackend(gen, v, deps, blob, c.cliente);
    });
    cola = {
      bytes,
      tipo,
      cliente,
      parar() {
        pararVencimiento();
        pararRed();
      },
    };
  }

  async function enviarAlBackend(gen: number, v: HTMLVideoElement, deps: DependenciasLector, imagen: Blob, cliente: unknown): Promise<void> {
    const control = new AbortController();
    verificacion = control;
    const { verificar } = await import("./verificacion.js");
    if (gen !== generacion) return;
    const local = estado.resultado;
    const salida = await verificar({
      backend: opciones.backend as string,
      encabezados: opciones.encabezadosBackend,
      imagen,
      cliente,
      streaming: opciones.streaming !== false,
      fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
      tiempoLimiteMs: opciones.tiempoLimiteMs ?? 30_000,
      inactividadMs: opciones.inactividadMs ?? 15_000,
      temporizar: deps.temporizar ?? temporizarPorOmision,
      senal: control.signal,
      alEvento: (e) => {
        if (gen === generacion) emitir({ tipo: "etapa", verificacion: { etapa: e.etapa, progreso: e.progreso ?? null } });
      },
    });
    if (gen !== generacion || salida.tipo === "cancelado") return;
    verificacion = null;
    if (salida.tipo === "ok") return emitir({ tipo: "verificado", resultado: resultadoConfiable(salida.documento, local) });
    if (salida.tipo === "fallo") return emitir({ tipo: "fallo", error: error(salida.codigo) });
    emitir({ tipo: "rechazo", rechazo: salida.rechazo, error: error("verificacion-rechazada") });
    // SDK-47: con intentos restantes la máquina vuelve a `activo`; se reabre la cámara y sigue la captura.
    if (estado.fase !== "activo") return;
    autocaptura.reiniciar();
    if (!(await abrir(gen, v))) return;
    bucle(gen, v, deps);
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
    if (gen !== generacion || !(await abrir(gen, v))) return;
    emitir({ tipo: "camara-lista" });
    bucle(gen, v, deps);
  }

  /** SDK-57: en `front-back` con `validacion: "auto"`, decide una vez, antes de abrir la cámara, si el front lee. */
  function decision(): Extract<EventoLector, { tipo: "iniciar" }>["decision"] {
    if (validacion !== "auto" || estado.frontActivo !== null) return undefined;
    let dispositivo;
    try {
      dispositivo = d?.senales?.() ?? leerDispositivo();
    } catch {
      dispositivo = {};
    }
    const r = decidirFront(dispositivo, opciones.umbralesAuto ?? {});
    return { frontActivo: r.usarFront, modoMotivo: r.motivo };
  }

  return {
    async iniciar(v) {
      if (destruido || invalida !== null || estado.fase !== "inicio") return;
      video = v;
      dejarDeObservar?.();
      dejarDeObservar = null;
      try {
        dejarDeObservar = (d?.observarVideo ?? observarVideoPorOmision)(v, () => alRedimensionar(v));
      } catch {
        // Sin observador: la guía se recalcula en cada frame.
      }
      reintentos.reiniciar();
      autoArranque = opciones.autoIniciar === true && !autoArranqueUsado;
      autoArranqueUsado = true;
      const dec = decision();
      emitir(dec === undefined ? { tipo: "iniciar" } : { tipo: "iniciar", decision: dec });
      await arrancar(v);
    },
    cancelar() {
      if (destruido) return;
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
      dejarDeObservar?.();
      dejarDeObservar = null;
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
