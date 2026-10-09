/**
 * Sesión de captura (design.md, decisiones 8 y 14): cámara, bucle de análisis con el planificador (CAL-10),
 * auto-captura con revalidación (CAL-11), feedback (CAL-12) y medidas de `performance`. Los frames viven solo en
 * memoria; la captura aceptada se pone a cero al repetir, cancelar u ocultarse la página (CAM-11).
 */
import {
  calcularGuia,
  clasificarErrorCamara,
  crearAutocaptura,
  crearCapturaAceptada,
  crearClienteCalidad,
  crearFeedback,
  crearPlanificador,
  evaluarEntorno,
  fotoAPixeles,
  iniciarCamara,
  tomarFrameAnalisis,
  tomarFoto,
  tomarFrameCaptura,
  UMBRALES_POR_DEFECTO,
  type Camara,
  type CapturaAceptada,
  type ClienteCalidad,
  type ContenidoPresenciaTd,
  type Cuadrilatero,
  type EntornoFoto,
  type FrameLectura,
} from "@lector-cedula/capture";
import type { Diagnostico } from "./diagnostico";
import type { Evento } from "./estado";
import { conLienzoTemporal } from "./lienzo";
import {
  crearClienteLector,
  nuevoWorkerLector,
  opcionesLecturaFrame,
  type ClienteLector,
} from "./lectura";
import { crearClienteFraude, datosParaFraude, framesParaFraude, nuevoWorkerFraude, type ClienteFraude } from "./fraude";
import { crearReintentos } from "./reintentos";
import { leerSecuencia, MAX_FRAMES_LECTURA } from "./secuencia";

export interface Observador {
  evento(e: Evento): void;
  feedback(texto: string): void;
  /** OFF-29: solo números y códigos; la app lo muestra con `?debug=1`. */
  diagnostico?(d: Diagnostico): void;
}

const MARCA = "camara:solicitada";

export interface Sesion {
  /** "Iniciar cámara", "Reintentar", "Continuar" y "Repetir". */
  iniciar(): Promise<void>;
  /** Asigna el `<video>` cuando la pantalla `activo` lo monta. */
  conectarVideo(video: HTMLVideoElement | null): void;
  /** "Cancelar". */
  cancelar(): void;
  /** Página oculta o `pagehide`. */
  ocultar(): void;
  /** "Cancelar" en `leyendo` (OFF-14): aborta la lectura y vuelve a la cámara. */
  cancelarLectura(): Promise<void>;
}

/** Fecha de referencia: hoy en America/Bogota como AAAA-MM-DD (design.md, decisión 11). */
export function hoyEnBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

const MARCA_LECTURA = "lectura:inicio";

/** Espera el siguiente frame del vídeo (requestVideoFrameCallback o un cuadro), como mucho 250 ms. */
function siguienteFrame(v: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolver) => {
    const t = setTimeout(resolver, 250);
    const listo = () => {
      clearTimeout(t);
      resolver();
    };
    if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(listo);
    else requestAnimationFrame(listo);
  });
}

/** OFF-28: ImageCapture del navegador (no existe en Firefox ni Safari). */
function entornoFoto(): EntornoFoto {
  const ImageCapture = (globalThis as { ImageCapture?: EntornoFoto["ImageCapture"] }).ImageCapture;
  return { ...(ImageCapture === undefined ? {} : { ImageCapture }), aPixeles: fotoAPixeles };
}

/** FRA-21: señal de fraude; OD-30a: `admitirTarjetaIdentidad` (VITE_ADMITIR_TI) pasa a `leerDocumento`. */
export interface OpcionesSesion {
  readonly fraude?: boolean;
  readonly admitirTarjetaIdentidad?: boolean;
}

/** OD-20: la presencia vio una MRZ (TD1 o TD3): sin foto de alta resolución ni frames extra (OFF-27, OFF-28). */
const esMrz = (c: ContenidoPresenciaTd): boolean => c === "mrz-td1" || c === "mrz-td3";

export function crearSesion(obs: Observador, opciones: OpcionesSesion = {}): Sesion {
  let cliente: ClienteCalidad<ContenidoPresenciaTd> | null = null;
  let lector: ClienteLector | null = null;
  // deteccion-fraude (FRA-17): Worker propio, creado en la primera señal y reutilizado.
  let fraude: ClienteFraude | null = null;
  let lectura: AbortController | null = null;
  let camara: Camara | null = null;
  let video: HTMLVideoElement | null = null;
  let captura: CapturaAceptada | null = null;
  // OFF-28: frames de lectura de la captura aceptada (foto, frame aceptado y frames consecutivos), pista y diagnóstico.
  let frames: FrameLectura[] = [];
  let pista: ContenidoPresenciaTd = null;
  let diagnostico: Omit<Diagnostico, "captura" | "pasos" | "totalMs"> = { resolucionPista: null, pista: null, fotoMs: null };
  let capturas = 0;
  let generacion = 0;
  let animacion = 0;
  const planificador = crearPlanificador(
    UMBRALES_POR_DEFECTO.intervaloMinimoMs,
    () => performance.now(),
  );
  const autocaptura = crearAutocaptura(UMBRALES_POR_DEFECTO);
  const feedback = crearFeedback();
  // OFF-26: cuenta de lecturas de la captura en curso; los botones la reinician, el reintento silencioso no.
  const reintentos = crearReintentos(() => performance.now());

  function obtenerCliente(): ClienteCalidad<ContenidoPresenciaTd> {
    // CAM-12: el Worker se descarga solo después de pulsar "Iniciar cámara". OD-20: inicia con `contenidoTd`.
    cliente ??= crearClienteCalidad<ContenidoPresenciaTd>(
      new Worker(new URL("./calidad.worker.ts", import.meta.url), {
        type: "module",
      }),
    );
    return cliente;
  }

  function obtenerLector(): ClienteLector {
    // pwa-lectura-offline (OFF-06): el Worker lector se crea en la primera lectura y se reutiliza.
    lector ??= crearClienteLector(nuevoWorkerLector());
    return lector;
  }

  function liberarCaptura(): void {
    captura?.liberar();
    captura = null;
    for (const f of frames) f.pixeles.fill(0);
    frames = [];
  }

  function abortarLectura(): void {
    lectura?.abort();
    lectura = null;
  }

  /** OFF-19: la lectura empieza sola al llegar a `listo`. La captura se copia al Worker y se pone a cero (OFF-11). */
  async function leerCaptura(): Promise<void> {
    const c = captura;
    if (c === null) return;
    const control = new AbortController();
    lectura = control;
    performance.clearMarks(MARCA_LECTURA);
    performance.mark(MARCA_LECTURA);
    // Un cuadro para que `listo` llegue a pintarse (OFF-19: es transitorio, pero forma parte del historial).
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    if (control.signal.aborted || captura !== c) return;
    obs.evento({ tipo: "leyendo" });
    reintentos.iniciar();
    capturas++;
    const inicio = performance.now();
    const base = { ...diagnostico, captura: capturas };
    obs.diagnostico?.({ ...base, pasos: [], totalMs: null });
    const p = pista;
    // FRA-17 y FRA-03: copias de los frames de vídeo para la señal (la secuencia pone a cero los originales); se ponen
    // a cero en cuanto se envían al Worker de fraude o si la lectura no termina en resultado.
    const copiasFraude = opciones.fraude !== true ? [] : framesParaFraude(frames.length > 0 ? frames : [{ ancho: c.ancho, alto: c.alto, pixeles: c.pixeles, origen: "video" }], c.ancho, c.alto).map((f) => ({
      ancho: f.ancho,
      alto: f.alto,
      pixeles: new Uint8ClampedArray(f.pixeles),
    }));
    const cuadrilateroFraude = c.cuadrilatero;
    const limpiarCopias = () => {
      for (const f of copiasFraude) f.pixeles.fill(0);
    };
    // OFF-28 (c): la secuencia pone a cero cada frame tras su última lectura; la captura se libera al terminar.
    const { resultado: r, pasos } = await leerSecuencia(
      frames.length > 0 ? frames : [{ ancho: c.ancho, alto: c.alto, pixeles: c.pixeles, origen: "video" }],
      p,
      (f, lector) => obtenerLector().leer(f, hoyEnBogota(), control.signal, opcionesLecturaFrame(p, lector, opciones.admitirTarjetaIdentidad === true)),
      { ahora: () => performance.now() },
    );
    if (control.signal.aborted) return limpiarCopias();
    liberarCaptura();
    obs.diagnostico?.({ ...base, pasos, totalMs: performance.now() - inicio });
    lectura = null;
    if (r.ok) performance.measure("lectura:tiempo", MARCA_LECTURA);
    if (
      !r.ok &&
      r.error !== "cancelada" &&
      reintentos.decidir(r) === "reintentar"
    ) {
      limpiarCopias();
      obs.evento({ tipo: "reintento" });
      await arrancar();
      return;
    }
    reintentos.reiniciar();
    if (!r.ok) {
      limpiarCopias();
      obs.evento({ tipo: "leida", resultado: r });
      return;
    }
    // FRA-21: con la señal apagada no se crea el Worker de fraude ni el evento lleva riesgo.
    if (opciones.fraude !== true) {
      obs.evento({ tipo: "leida", resultado: r });
      return;
    }
    const doc = datosParaFraude(r);
    let riesgo = null;
    if (doc !== null && copiasFraude.length > 0) {
      fraude ??= crearClienteFraude(nuevoWorkerFraude);
      const pendiente = fraude.evaluar({ frames: copiasFraude, cuadrilatero: cuadrilateroFraude, tipo: doc.tipo, datos: doc.datos, ahora: new Date().toISOString() });
      limpiarCopias();
      riesgo = await pendiente;
    } else limpiarCopias();
    obs.evento({ tipo: "leida", resultado: r, riesgo });
  }

  function detener(): void {
    generacion++;
    cancelAnimationFrame(animacion);
    camara?.detener();
    camara = null;
    if (video !== null) video.srcObject = null;
    planificador.reiniciar();
    autocaptura.reiniciar();
    feedback.reiniciar();
  }

  function fallar(): void {
    detener();
    liberarCaptura();
    obs.evento({ tipo: "fallo", codigo: "desconocido" });
  }

  async function revalidar(
    v: HTMLVideoElement,
    c: ClienteCalidad<ContenidoPresenciaTd>,
    gen: number,
  ): Promise<void> {
    const completo = tomarFrameCaptura(v);
    // El lienzo se vacía en todas las ramas (hallazgo del revisor de privacidad).
    const r = await conLienzoTemporal(completo, (lienzo) =>
      c.analizar(tomarFrameAnalisis(lienzo, completo.ancho, completo.alto)),
    );
    if (gen !== generacion) return (completo.pixeles.fill(0), undefined);
    if (!r.ok) return (completo.pixeles.fill(0), fallar());
    const paso = autocaptura.revalidar(r.resultado);
    if (!paso.aceptada) {
      completo.pixeles.fill(0);
      return;
    }
    // OFF-27 y OFF-28: con la cámara aún encendida (CAM-10 la detiene antes de listo), foto de alta resolución si la
    // pista no es MRZ y, con pista PDF417, frames consecutivos del vídeo hasta MAX_FRAMES_LECTURA.
    const contenido = r.contenido;
    const nuevos: FrameLectura[] = [];
    const descartar = () => {
      completo.pixeles.fill(0);
      for (const f of nuevos) f.pixeles.fill(0);
    };
    const pistaVideo = camara?.stream.getVideoTracks()[0];
    let fotoMs: number | null = null;
    if (!esMrz(contenido) && pistaVideo !== undefined) {
      const t = performance.now();
      const foto = await tomarFoto(pistaVideo, entornoFoto());
      if (foto !== null) {
        nuevos.push(foto);
        fotoMs = performance.now() - t;
      }
      if (gen !== generacion) return descartar();
    }
    nuevos.push({ ancho: completo.ancho, alto: completo.alto, pixeles: completo.pixeles, origen: "video" });
    while (contenido === "pdf417" && nuevos.length < MAX_FRAMES_LECTURA) {
      await siguienteFrame(v);
      if (gen !== generacion) return descartar();
      nuevos.push({ ...tomarFrameCaptura(v), origen: "video" });
    }
    frames = nuevos;
    pista = contenido;
    diagnostico = { resolucionPista: { ancho: completo.ancho, alto: completo.alto }, pista: contenido, fotoMs };
    const g = calcularGuia(completo.ancho, completo.alto);
    const cuadrilatero: Cuadrilatero = [
      [g.x, g.y],
      [g.x + g.ancho, g.y],
      [g.x + g.ancho, g.y + g.alto],
      [g.x, g.y + g.alto],
    ];
    captura = crearCapturaAceptada({
      ancho: completo.ancho,
      alto: completo.alto,
      pixeles: completo.pixeles,
      cuadrilatero,
      calidad: paso.calidad,
    });
    detener();
    performance.measure("captura:tiempo-a-listo", {
      start: MARCA,
      end: performance.now(),
    });
    obs.feedback(feedback.listo());
    obs.evento({ tipo: "capturada" });
    await leerCaptura();
  }

  async function analizar(
    v: HTMLVideoElement,
    c: ClienteCalidad<ContenidoPresenciaTd>,
    gen: number,
  ): Promise<void> {
    const inicio = performance.now();
    const r = await c.analizar(
      tomarFrameAnalisis(v, v.videoWidth, v.videoHeight),
    );
    if (gen !== generacion) return;
    performance.measure("calidad:frame", {
      start: inicio,
      end: performance.now(),
    });
    if (!r.ok) return fallar();
    obs.feedback(feedback.actualizar(r.resultado));
    const paso = autocaptura.registrar(r.resultado.score);
    if (paso.solicitarCaptura) await revalidar(v, c, gen);
    if (gen === generacion) planificador.completar();
  }

  function bucle(gen: number): void {
    if (gen !== generacion) return;
    const v = video;
    if (
      v !== null &&
      v.videoWidth > 0 &&
      autocaptura.fase === "analizando" &&
      planificador.intentar()
    ) {
      analizar(v, obtenerCliente(), gen).catch(() => {
        if (gen === generacion) fallar();
      });
    }
    animacion = requestAnimationFrame(() => bucle(gen));
  }

  /** Arranca la cámara y el análisis; no toca la cuenta de reintentos (OFF-26). */
  async function arrancar(): Promise<void> {
    abortarLectura();
    detener();
    liberarCaptura();
    performance.clearMarks(MARCA);
    performance.clearMeasures();
    performance.mark(MARCA);
    const gen = generacion;
    const entorno = evaluarEntorno({
      contextoSeguro: window.isSecureContext,
      tieneGetUserMedia:
        typeof navigator.mediaDevices?.getUserMedia === "function",
    });
    if (entorno !== "apto")
      return obs.evento({ tipo: "fallo", codigo: entorno });
    let nueva: Camara;
    try {
      nueva = await iniciarCamara(navigator.mediaDevices);
    } catch (e) {
      if (gen === generacion)
        obs.evento({ tipo: "fallo", codigo: clasificarErrorCamara(e).codigo });
      return;
    }
    if (gen !== generacion) return nueva.detener();
    camara = nueva;
    obtenerCliente();
    obs.feedback(feedback.texto);
    obs.evento({ tipo: "camara-iniciada" });
    if (nueva.aviso !== null) obs.evento({ tipo: "aviso", texto: nueva.aviso });
    if (video !== null) video.srcObject = nueva.stream;
    animacion = requestAnimationFrame(() => bucle(gen));
  }

  const sesion: Sesion = {
    async iniciar() {
      reintentos.reiniciar();
      capturas = 0;
      await arrancar();
    },
    conectarVideo(v) {
      video = v;
      if (v !== null && camara !== null) v.srcObject = camara.stream;
    },
    cancelar() {
      reintentos.reiniciar();
      abortarLectura();
      detener();
      liberarCaptura();
      obs.evento({ tipo: "cancelar" });
    },
    ocultar() {
      abortarLectura();
      detener();
      liberarCaptura();
      obs.evento({ tipo: "oculta" });
    },
    async cancelarLectura() {
      abortarLectura();
      liberarCaptura();
      await sesion.iniciar();
    },
  };
  return sesion;
}
