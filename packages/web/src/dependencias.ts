/**
 * Dependencias por omisión del núcleo (design.md, "Arquitectura del núcleo"): cámara, Worker de calidad, captura con
 * revalidación, foto y frames consecutivos, y Worker lector, todo sobre la API pública de `@lector-cedula/capture`.
 * Los Workers se crean desde URL `blob:` de bytes verificados (SDK-39). Solo se importa dinámicamente en `iniciar`.
 * Código de entorno (navegador): lo cubren las pruebas de Vitest browser y los E2E.
 */
// Stryker disable all
import {
  calcularGuia,
  crearClienteCalidad,
  evaluarEntorno,
  fotoAPixeles,
  iniciarCamara,
  tomarFoto,
  tomarFrameAnalisis,
  tomarFrameCaptura,
  UMBRALES_POR_DEFECTO,
  type ClienteCalidad,
  type EntornoFoto,
  type FrameLectura,
} from "@lector-cedula/capture";
import { entornoNavegador, ErrorMotor, motorMemorizado, recursosPorOmision, type MotorCargado } from "./cargador.js";
import { crearClienteLector, type ClienteLector } from "./cliente-lector.js";
import { leerSecuencia, MAX_FRAMES_LECTURA } from "./secuencia.js";
import type { CalidadInyectada, CamaraLector, CapturaLector, DependenciasLector, LectorInyectado, MotivoCalidad, OpcionesLector } from "./tipos.js";

/** Presupuestos de lectura de la PWA (OFF-23, OFF-28). */
const PRESUPUESTO = { maxLlamadasOcr: 12, tiempoLimiteMs: 15_000, realcePdf417: true, limitePdf417Ms: 6_000 } as const;

export function hoyEnBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

function siguienteFrame(v: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolver) => {
    const t = setTimeout(resolver, 250);
    const listo = (): void => {
      clearTimeout(t);
      resolver();
    };
    if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(listo);
    else requestAnimationFrame(listo);
  });
}

function entornoFoto(): EntornoFoto {
  const ImageCapture = (globalThis as { ImageCapture?: EntornoFoto["ImageCapture"] }).ImageCapture;
  return { ...(ImageCapture === undefined ? {} : { ImageCapture }), aPixeles: fotoAPixeles };
}

async function conLienzo<T>(f: { ancho: number; alto: number; pixeles: Uint8ClampedArray }, fn: (l: OffscreenCanvas) => Promise<T>): Promise<T> {
  const lienzo = new OffscreenCanvas(f.ancho, f.alto);
  const ctx = lienzo.getContext("2d") as OffscreenCanvasRenderingContext2D;
  try {
    ctx.putImageData(new ImageData(f.pixeles as Uint8ClampedArray<ArrayBuffer>, f.ancho, f.alto), 0, 0);
    return await fn(lienzo);
  } finally {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    lienzo.width = 1;
    lienzo.height = 1;
  }
}

/** JPEG de una copia del frame para el envío opcional (la copia se pone a cero al codificar). */
function imagenDe(f: { ancho: number; alto: number; pixeles: Uint8ClampedArray }): () => Promise<Blob> {
  const copia = { ancho: f.ancho, alto: f.alto, pixeles: new Uint8ClampedArray(f.pixeles) };
  return () =>
    conLienzo(copia, (l) => l.convertToBlob({ type: "image/jpeg", quality: 0.92 })).finally(() => {
      copia.pixeles.fill(0);
    });
}

const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function workerDe(url: string | undefined): Worker {
  if (url === undefined) throw new ErrorMotor("recurso-ausente");
  return new Worker(url, { type: "module" });
}

/** Worker lector desde los recursos verificados (rutas `blob:`). */
export function abrirWorkerLector(m: MotorCargado): ClienteLector {
  const u = m.urls;
  const w = workerDe(u["lector.js"]);
  const core = WebAssembly.validate(SIMD) ? u["tesseract-core-simd-lstm.wasm.js"] : u["tesseract-core-lstm.wasm.js"];
  // `#` final: tesseract.js pide `${langPath}/mrz.traineddata` y elige el core si la ruta acaba en `js`; el fragmento
  // no cuenta al resolver la URL blob.
  w.postMessage({
    tipo: "rutas",
    rutas: {
      zxingWasm: u["zxing_reader.wasm"],
      tesseractWorker: u["tesseract-worker.min.js"],
      tesseractCore: `${core ?? ""}#.js`,
      modeloMrz: `${u["mrz.traineddata"] ?? ""}#`,
      ...PRESUPUESTO,
      enmascarar: false,
    },
  });
  return crearClienteLector(w);
}

export function crearDependencias(opciones: OpcionesLector): DependenciasLector {
  const recursos = opciones.recursos ?? recursosPorOmision();
  const motor = (): Promise<MotorCargado> => motorMemorizado(recursos, entornoNavegador());
  let cliente: ClienteCalidad | null = null;
  let lectorWorker: ClienteLector | null = null;

  return {
    async abrirCamara(video) {
      const entorno = evaluarEntorno({
        contextoSeguro: globalThis.isSecureContext,
        tieneGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
      });
      if (entorno !== "apto") throw Object.assign(new Error(entorno), { codigo: "entorno-no-soportado" });
      // El motor se verifica antes de pedir la cámara: un recurso alterado termina en `motor-no-disponible` (SDK-39).
      const m = await motor();
      const camara = await iniciarCamara(navigator.mediaDevices);
      video.srcObject = camara.stream;
      await video.play().catch(() => undefined);
      void m;
      return camara satisfies CamaraLector;
    },
    crearCalidad(): CalidadInyectada {
      let terminado = false;
      return {
        async analizar(video) {
          if (video.videoWidth === 0 || terminado) return null;
          const m = await motor();
          cliente ??= crearClienteCalidad(workerDe(m.urls["calidad.js"]));
          const r = await cliente.analizar(tomarFrameAnalisis(video, video.videoWidth, video.videoHeight));
          if (!r.ok) throw new Error(r.codigo);
          return {
            score: r.resultado.score,
            motivo: r.resultado.motivo as MotivoCalidad | null,
            guia: calcularGuia(video.videoWidth, video.videoHeight),
            anchoVideo: video.videoWidth,
            altoVideo: video.videoHeight,
            contenido: r.contenido,
          };
        },
        terminar() {
          terminado = true;
          cliente?.terminar();
          cliente = null;
        },
      };
    },
    async capturar(video, camara, contenido): Promise<CapturaLector | null> {
      const c = cliente;
      if (c === null) return null;
      const completo = tomarFrameCaptura(video);
      const r = await conLienzo(completo, (l) => c.analizar(tomarFrameAnalisis(l, completo.ancho, completo.alto)));
      if (!r.ok || r.resultado.score < UMBRALES_POR_DEFECTO.umbralListo) {
        completo.pixeles.fill(0);
        return null;
      }
      const imagen = opciones.sesion === undefined ? undefined : imagenDe(completo);
      const frames: FrameLectura[] = [];
      const pista = camara.stream.getVideoTracks()[0];
      if (r.contenido !== "mrz" && pista !== undefined) {
        const foto = await tomarFoto(pista, entornoFoto());
        if (foto !== null) frames.push(foto);
      }
      frames.push({ ...completo, origen: "video" });
      while (r.contenido === "pdf417" && frames.length < MAX_FRAMES_LECTURA) {
        await siguienteFrame(video);
        frames.push({ ...tomarFrameCaptura(video), origen: "video" });
      }
      const p = r.contenido ?? contenido;
      return {
        frames,
        pista: p,
        ...(imagen === undefined ? {} : { imagen }),
        liberar() {
          for (const f of frames) f.pixeles.fill(0);
        },
      };
    },
    crearLector(): LectorInyectado {
      return {
        async leer(captura, senal, progreso) {
          const m = await motor();
          lectorWorker ??= abrirWorkerLector(m);
          const cl = lectorWorker;
          const total = Math.max(1, captura.frames.length);
          let hechos = 0;
          const fecha = hoyEnBogota();
          const { resultado } = await leerSecuencia(
            captura.frames,
            captura.pista,
            async (f, lector) => {
              const r = await cl.leer(f, fecha, senal, {
                ...(lector === null ? {} : { pista: lector, respaldo: false }),
                ...(opciones.admitirTi === true ? { admitirTarjetaIdentidad: true } : {}),
              });
              progreso(Math.min(0.99, ++hechos / (total + 1)));
              return r;
            },
            { ahora: () => performance.now() },
          );
          return resultado;
        },
        terminar() {
          lectorWorker?.terminar();
          lectorWorker = null;
        },
      };
    },
    programar(fn) {
      const id = requestAnimationFrame(() => fn());
      return () => cancelAnimationFrame(id);
    },
    ahora: () => performance.now(),
  };
}
