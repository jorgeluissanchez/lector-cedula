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
}

export function crearSesion(obs: Observador): Sesion {
  let cliente: ClienteCalidad | null = null;
  let camara: Camara | null = null;
  let video: HTMLVideoElement | null = null;
  let captura: CapturaAceptada | null = null;
  let generacion = 0;
  let animacion = 0;
  const planificador = crearPlanificador(UMBRALES_POR_DEFECTO.intervaloMinimoMs, () => performance.now());
  const autocaptura = crearAutocaptura(UMBRALES_POR_DEFECTO);
  const feedback = crearFeedback();

  function obtenerCliente(): ClienteCalidad {
    // CAM-12: el Worker se descarga solo después de pulsar "Iniciar cámara".
    cliente ??= crearClienteCalidad(new Worker(new URL("./calidad.worker.ts", import.meta.url), { type: "module" }));
    return cliente;
  }

  function liberarCaptura(): void {
    captura?.liberar();
    captura = null;
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

  async function revalidar(v: HTMLVideoElement, c: ClienteCalidad, gen: number): Promise<void> {
    const completo = tomarFrameCaptura(v);
    const lienzo = new OffscreenCanvas(completo.ancho, completo.alto);
    const ctx = lienzo.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.putImageData(new ImageData(completo.pixeles as Uint8ClampedArray<ArrayBuffer>, completo.ancho, completo.alto), 0, 0);
    const r = await c.analizar(tomarFrameAnalisis(lienzo, completo.ancho, completo.alto));
    if (gen !== generacion) return completo.pixeles.fill(0), undefined;
    if (!r.ok) return completo.pixeles.fill(0), fallar();
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
    captura = crearCapturaAceptada({ ancho: completo.ancho, alto: completo.alto, pixeles: completo.pixeles, cuadrilatero, calidad: paso.calidad });
    detener();
    performance.measure("captura:tiempo-a-listo", { start: MARCA, end: performance.now() });
    obs.feedback(feedback.listo());
    obs.evento({ tipo: "capturada" });
  }

  async function analizar(v: HTMLVideoElement, c: ClienteCalidad, gen: number): Promise<void> {
    const inicio = performance.now();
    const r = await c.analizar(tomarFrameAnalisis(v, v.videoWidth, v.videoHeight));
    if (gen !== generacion) return;
    performance.measure("calidad:frame", { start: inicio, end: performance.now() });
    if (!r.ok) return fallar();
    obs.feedback(feedback.actualizar(r.resultado));
    const paso = autocaptura.registrar(r.resultado.score);
    if (paso.solicitarCaptura) await revalidar(v, c, gen);
    if (gen === generacion) planificador.completar();
  }

  function bucle(gen: number): void {
    if (gen !== generacion) return;
    const v = video;
    if (v !== null && v.videoWidth > 0 && autocaptura.fase === "analizando" && planificador.intentar()) {
      analizar(v, obtenerCliente(), gen).catch(() => {
        if (gen === generacion) fallar();
      });
    }
    animacion = requestAnimationFrame(() => bucle(gen));
  }

  return {
    async iniciar() {
      detener();
      liberarCaptura();
      performance.clearMarks(MARCA);
      performance.clearMeasures();
      performance.mark(MARCA);
      const gen = generacion;
      const entorno = evaluarEntorno({
        contextoSeguro: window.isSecureContext,
        tieneGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
      });
      if (entorno !== "apto") return obs.evento({ tipo: "fallo", codigo: entorno });
      let nueva: Camara;
      try {
        nueva = await iniciarCamara(navigator.mediaDevices);
      } catch (e) {
        if (gen === generacion) obs.evento({ tipo: "fallo", codigo: clasificarErrorCamara(e).codigo });
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
    },
    conectarVideo(v) {
      video = v;
      if (v !== null && camara !== null) v.srcObject = camara.stream;
    },
    cancelar() {
      detener();
      liberarCaptura();
      obs.evento({ tipo: "cancelar" });
    },
    ocultar() {
      detener();
      liberarCaptura();
      obs.evento({ tipo: "oculta" });
    },
  };
}
