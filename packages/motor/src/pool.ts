// MOT-04, MOT-05 y MOT-21 (D1 de design.md): pool propio mínimo de worker_threads, sin dependencias. N workers, cola
// acotada (llena: `motor-ocupado` sin encolar), reemplazo del worker al caer, al agotar el tiempo o al cancelar
// (`worker.terminate()` es la única cancelación fiable del OCR en WASM) y cierre que rechaza lo pendiente.
import { Worker } from "node:worker_threads";
import { codigoErrorMotor, ErrorMotor } from "@lector-cedula/protocolo";

export interface OpcionesPool {
  readonly archivo: URL;
  readonly hilos: number;
  readonly colaMaxima: number;
  /** `workerData` de cada worker (rutas y límites; nunca datos de la imagen). */
  readonly datos?: unknown;
}

export interface OpcionesTarea {
  readonly senal?: AbortSignal;
  readonly tiempoMs?: number;
  readonly transferir?: readonly ArrayBuffer[];
  readonly alProgreso?: (progreso: number) => void;
}

export interface EstadisticasPool {
  readonly enCurso: number;
  readonly maximoEnCurso: number;
  /** Tareas entregadas a un worker. */
  readonly tareas: number;
  readonly workers: number;
}

export interface Pool {
  ejecutar(carga: unknown, opciones?: OpcionesTarea): Promise<unknown>;
  cerrar(): Promise<void>;
  estadisticas(): EstadisticasPool;
  trabajadores(): readonly Worker[];
}

interface Tarea {
  readonly id: number;
  readonly carga: unknown;
  readonly opciones: OpcionesTarea;
  readonly resolver: (v: unknown) => void;
  readonly rechazar: (e: ErrorMotor) => void;
  quitarEscucha?: () => void;
  temporizador?: ReturnType<typeof setTimeout>;
}

interface Hilo {
  worker: Worker;
  tarea: Tarea | null;
}

type Mensaje = { id: number; progreso: number } | { id: number; ok: true; valor: unknown } | { id: number; ok: false; error: unknown };

/**
 * Los workers no heredan las banderas del proceso (un ejecutor de pruebas puede pasar cargadores que el worker no
 * entiende). Solo con NODE_ENV=test, LECTOR_MOTOR_EXEC_ARGV (separado por saltos de línea) permite precargar en cada
 * worker los hooks de privacidad (bloquear-red.mjs, bloquear-escrituras.mjs) de MOT-06 y MOT-07.
 */
function argumentosTrabajador(): string[] {
  const valor = process.env.LECTOR_MOTOR_EXEC_ARGV;
  return process.env.NODE_ENV === "test" && valor ? valor.split("\n") : [];
}

export function crearPool(opciones: OpcionesPool): Pool {
  const cola: Tarea[] = [];
  const hilos: Hilo[] = [];
  let cerrado = false;
  let siguienteId = 1;
  let maximoEnCurso = 0;
  let tareas = 0;

  const enCurso = () => hilos.filter((h) => h.tarea !== null).length;

  function terminarTarea(t: Tarea): void {
    clearTimeout(t.temporizador);
    t.quitarEscucha?.();
  }

  function crearHilo(): Hilo {
    const hilo: Hilo = { worker: new Worker(opciones.archivo, { workerData: opciones.datos, execArgv: argumentosTrabajador() }), tarea: null };
    hilo.worker.on("message", (m: Mensaje) => {
      const t = hilo.tarea;
      if (t === null || m.id !== t.id) return;
      if ("progreso" in m) {
        t.opciones.alProgreso?.(m.progreso);
        return;
      }
      hilo.tarea = null;
      terminarTarea(t);
      if (m.ok) t.resolver(m.valor);
      else t.rechazar(new ErrorMotor(codigoErrorMotor(m.error) ?? "motor-error-interno"));
      despachar();
    });
    // Caída inesperada (process.exit, excepción no atrapada): la tarea falla y el worker se reemplaza.
    const caida = () => {
      const i = hilos.indexOf(hilo);
      if (i === -1) return;
      hilos.splice(i, 1);
      const t = hilo.tarea;
      hilo.tarea = null;
      if (t) {
        terminarTarea(t);
        t.rechazar(new ErrorMotor("motor-error-interno"));
      }
      if (!cerrado) {
        hilos.push(crearHilo());
        despachar();
      }
    };
    hilo.worker.on("error", caida);
    hilo.worker.on("exit", caida);
    return hilo;
  }

  /** Termina el worker de una tarea en curso, la rechaza con `codigo` y pone otro en su lugar. */
  function abortarEnCurso(hilo: Hilo, codigo: "tiempo-agotado" | "cancelado"): void {
    const t = hilo.tarea;
    const i = hilos.indexOf(hilo);
    if (t === null || i === -1) return;
    hilos.splice(i, 1);
    hilo.tarea = null;
    terminarTarea(t);
    void hilo.worker.terminate();
    t.rechazar(new ErrorMotor(codigo));
    if (!cerrado) {
      hilos.push(crearHilo());
      despachar();
    }
  }

  function despachar(): void {
    for (const hilo of hilos) {
      if (hilo.tarea !== null) continue;
      const t = cola.shift();
      if (t === undefined) return;
      hilo.tarea = t;
      tareas++;
      maximoEnCurso = Math.max(maximoEnCurso, enCurso());
      if (t.opciones.tiempoMs !== undefined) t.temporizador = setTimeout(() => abortarEnCurso(hilo, "tiempo-agotado"), t.opciones.tiempoMs);
      hilo.worker.postMessage({ id: t.id, carga: t.carga }, [...(t.opciones.transferir ?? [])]);
    }
  }

  for (let i = 0; i < opciones.hilos; i++) hilos.push(crearHilo());

  return {
    ejecutar(carga, op = {}) {
      return new Promise<unknown>((resolver, rechazar) => {
        if (cerrado) return rechazar(new ErrorMotor("motor-cerrado"));
        if (op.senal?.aborted === true) return rechazar(new ErrorMotor("cancelado"));
        const libre = hilos.some((h) => h.tarea === null);
        if (!libre && cola.length >= opciones.colaMaxima) return rechazar(new ErrorMotor("motor-ocupado"));
        const t: Tarea = { id: siguienteId++, carga, opciones: op, resolver, rechazar };
        if (op.senal) {
          const senal = op.senal;
          const alAbortar = () => {
            const enCola = cola.indexOf(t);
            if (enCola !== -1) {
              cola.splice(enCola, 1);
              terminarTarea(t);
              t.rechazar(new ErrorMotor("cancelado"));
              return;
            }
            const hilo = hilos.find((h) => h.tarea === t);
            if (hilo) abortarEnCurso(hilo, "cancelado");
          };
          senal.addEventListener("abort", alAbortar, { once: true });
          t.quitarEscucha = () => senal.removeEventListener("abort", alAbortar);
        }
        cola.push(t);
        despachar();
      });
    },
    async cerrar() {
      if (cerrado) return;
      cerrado = true;
      const pendientes = [...cola.splice(0), ...hilos.flatMap((h) => (h.tarea ? [h.tarea] : []))];
      const workers = hilos.splice(0).map((h) => {
        h.tarea = null;
        return h.worker;
      });
      for (const t of pendientes) {
        terminarTarea(t);
        t.rechazar(new ErrorMotor("motor-cerrado"));
      }
      await Promise.all(workers.map((w) => w.terminate()));
    },
    estadisticas: () => ({ enCurso: enCurso(), maximoEnCurso, tareas, workers: hilos.length }),
    trabajadores: () => hilos.map((h) => h.worker),
  };
}
