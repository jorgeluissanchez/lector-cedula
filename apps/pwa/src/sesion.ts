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
  iniciarCamara,
  tomarFrameAnalisis,
  tomarFrameCaptura,
  UMBRALES_POR_DEFECTO,
  type Camara,
  type CapturaAceptada,
  type ClienteCalidad,
  type Cuadrilatero,
} from "@lector-cedula/capture";
import type { Evento } from "./estado";
import { conLienzoTemporal } from "./lienzo";
import {
  crearClienteLector,
  nuevoWorkerLector,
  type ClienteLector,
} from "./lectura";
import { crearReintentos } from "./reintentos";

export interface Observador {
  evento(e: Evento): void;
  feedback(texto: string): void;
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

export function crearSesion(obs: Observador): Sesion {
  let cliente: ClienteCalidad | null = null;
  let lector: ClienteLector | null = null;
  let lectura: AbortController | null = null;
  let camara: Camara | null = null;
  let video: HTMLVideoElement | null = null;
  let captura: CapturaAceptada | null = null;
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

  function obtenerCliente(): ClienteCalidad {
    // CAM-12: el Worker se descarga solo después de pulsar "Iniciar cámara".
    cliente ??= crearClienteCalidad(
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
    const pendiente = obtenerLector().leer(
      { ancho: c.ancho, alto: c.alto, pixeles: c.pixeles },
      hoyEnBogota(),
      control.signal,
    );
    liberarCaptura();
    const r = await pendiente;
    if (control.signal.aborted) return;
    lectura = null;
    if (r.ok) performance.measure("lectura:tiempo", MARCA_LECTURA);
    if (
      !r.ok &&
      r.error !== "cancelada" &&
      reintentos.decidir(r) === "reintentar"
    ) {
      obs.evento({ tipo: "reintento" });
      await arrancar();
      return;
    }
    reintentos.reiniciar();
    obs.evento({ tipo: "leida", resultado: r });
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
    c: ClienteCalidad,
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
    c: ClienteCalidad,
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
