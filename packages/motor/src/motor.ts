// MOT-01, MOT-04, MOT-05, MOT-07 y MOT-08: crearMotor y el atajo leerDocumento. Los límites de bytes y píxeles se
// comprueban en el hilo principal antes de crear ninguna tarea (la cabecera da las dimensiones sin decodificar). La copia
// interna de la imagen se transfiere al worker y allí se pone a cero; la entrada del llamador solo se borra con
// `borrarEntrada: true`. El registro opcional recibe solo `{ evento, duracionMs, codigo? }`.
import { availableParallelism } from "node:os";
import { crearLectorMrz, type LectorMrz } from "@lector-cedula/capture";
import { codigoErrorMotor, ErrorMotor, type MotorLector, type OpcionesLecturaMotor, type ResultadoMotor } from "@lector-cedula/protocolo";
import { leerCabecera } from "./cabeceras.js";
import { hoyEnBogota, leerImagen } from "./leer.js";
import { crearPool, type EstadisticasPool, type Pool } from "./pool.js";
import { rutaModeloPorDefecto, verificarModelo } from "./recursos.js";

export const LIMITES_POR_DEFECTO = {
  bytesMaximos: 10_485_760,
  pixelesMaximos: 40_000_000,
  tiempoMaximoMs: 15_000,
  llamadasOcrMaximas: 12,
} as const;
export const COLA_MAXIMA_POR_DEFECTO = 64;

export interface EventoRegistro {
  readonly evento: "lectura";
  readonly duracionMs: number;
  readonly codigo?: string;
}

export interface OpcionesMotor {
  /** Workers del pool; por omisión `max(1, availableParallelism() - 1)`. `0` lee en el hilo principal (sin pool). */
  readonly hilos?: number;
  readonly colaMaxima?: number;
  readonly bytesMaximos?: number;
  readonly pixelesMaximos?: number;
  readonly tiempoMaximoMs?: number;
  readonly llamadasOcrMaximas?: number;
  /** Por omisión `true` (MOT-09). */
  readonly fraude?: boolean;
  /** Directorio con `mrz.traineddata`. */
  readonly rutaModelo?: string;
  /** Solo eventos sin datos del documento (MOT-08). */
  readonly registro?: (evento: EventoRegistro) => void;
}

export interface Motor extends MotorLector {
  /** Contadores del pool (pruebas y métricas; nunca datos). */
  estadisticas(): EstadisticasPool;
}

function entero(valor: unknown, minimo: number, porDefecto: number): number {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < minimo) throw new ErrorMotor("opciones-invalidas");
  return valor;
}

/** Archivo del worker compilado (también cuando las pruebas importan las fuentes .ts). */
function archivoTrabajador(): URL {
  return new URL(import.meta.url.endsWith(".ts") ? "../dist/trabajador.js" : "./trabajador.js", import.meta.url);
}

export async function crearMotor(opciones: OpcionesMotor = {}): Promise<Motor> {
  const hilos = entero(opciones.hilos, 0, Math.max(1, availableParallelism() - 1));
  const colaMaxima = entero(opciones.colaMaxima, 0, COLA_MAXIMA_POR_DEFECTO);
  const bytesMaximos = entero(opciones.bytesMaximos, 1, LIMITES_POR_DEFECTO.bytesMaximos);
  const pixelesMaximos = entero(opciones.pixelesMaximos, 1, LIMITES_POR_DEFECTO.pixelesMaximos);
  const tiempoPorDefecto = entero(opciones.tiempoMaximoMs, 1, LIMITES_POR_DEFECTO.tiempoMaximoMs);
  const llamadasOcrMaximas = entero(opciones.llamadasOcrMaximas, 1, LIMITES_POR_DEFECTO.llamadasOcrMaximas);
  const fraudePorDefecto = opciones.fraude !== false;
  const rutaModelo = opciones.rutaModelo ?? rutaModeloPorDefecto();
  // MOT-06: antes de cualquier OCR.
  verificarModelo(rutaModelo);

  const pool: Pool | null = hilos > 0 ? crearPool({ archivo: archivoTrabajador(), hilos, colaMaxima, datos: { rutaModelo, llamadasOcrMaximas } }) : null;
  let lectorPrincipal: LectorMrz | null = null;
  let enCursoPrincipal = 0;
  let maximoPrincipal = 0;
  let tareasPrincipal = 0;
  let cerrado = false;

  async function enHiloPrincipal(copia: Uint8Array, op: OpcionesLecturaMotor, fechaReferencia: string, tiempoMs: number): Promise<ResultadoMotor> {
    lectorPrincipal ??= crearLectorMrz({ rutaModelo, maxLlamadasOcr: llamadasOcrMaximas });
    tareasPrincipal++;
    enCursoPrincipal++;
    maximoPrincipal = Math.max(maximoPrincipal, enCursoPrincipal);
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        leerImagen(copia, lectorPrincipal, {
          fechaReferencia,
          admitirTarjetaIdentidad: op.admitirTarjetaIdentidad === true,
          fraude: op.fraude ?? fraudePorDefecto,
          ...(op.senal ? { senal: op.senal } : {}),
        }),
        new Promise<never>((_r, rechazar) => {
          temporizador = setTimeout(() => rechazar(new ErrorMotor("tiempo-agotado")), tiempoMs);
        }),
      ]);
    } finally {
      clearTimeout(temporizador);
      enCursoPrincipal--;
    }
  }

  async function leer(imagen: Uint8Array, op: OpcionesLecturaMotor = {}): Promise<ResultadoMotor> {
    if (cerrado) throw new ErrorMotor("motor-cerrado");
    if (!(imagen instanceof Uint8Array)) throw new ErrorMotor("opciones-invalidas");
    if (op.senal?.aborted === true) throw new ErrorMotor("cancelado");
    if (imagen.byteLength > bytesMaximos) throw new ErrorMotor("imagen-demasiado-grande");
    const cabecera = leerCabecera(imagen);
    if (cabecera === null) throw new ErrorMotor("formato-no-soportado");
    if (cabecera.ancho * cabecera.alto > pixelesMaximos) throw new ErrorMotor("imagen-demasiado-grande");
    const tiempoMs = entero(op.tiempoMaximoMs, 1, tiempoPorDefecto);
    const fechaReferencia = op.fechaReferencia ?? hoyEnBogota();
    const copia = new Uint8Array(imagen);
    try {
      if (pool === null) return await enHiloPrincipal(copia, op, fechaReferencia, tiempoMs);
      const carga = { bytes: copia.buffer, fechaReferencia, admitirTarjetaIdentidad: op.admitirTarjetaIdentidad === true, fraude: op.fraude ?? fraudePorDefecto };
      return (await pool.ejecutar(carga, {
        transferir: [copia.buffer],
        tiempoMs,
        ...(op.senal ? { senal: op.senal } : {}),
        ...(op.alProgreso ? { alProgreso: op.alProgreso } : {}),
      })) as ResultadoMotor;
    } finally {
      // Transferida al worker, la copia queda separada (byteLength 0): allí se pone a cero.
      if (copia.byteLength > 0) copia.fill(0);
      if (op.borrarEntrada === true) imagen.fill(0);
    }
  }

  return {
    async leerDocumento(imagen, op) {
      const inicio = performance.now();
      try {
        const r = await leer(imagen, op);
        opciones.registro?.({ evento: "lectura", duracionMs: performance.now() - inicio, ...(r.ok ? {} : { codigo: r.error.codigo }) });
        return r;
      } catch (error) {
        const codigo = codigoErrorMotor(error);
        opciones.registro?.({ evento: "lectura", duracionMs: performance.now() - inicio, codigo: codigo ?? "motor-error-interno" });
        throw codigo === null ? new ErrorMotor("motor-error-interno") : error;
      }
    },
    async cerrar() {
      cerrado = true;
      await pool?.cerrar();
      await lectorPrincipal?.terminar();
    },
    estadisticas: () => pool?.estadisticas() ?? { enCurso: enCursoPrincipal, maximoEnCurso: maximoPrincipal, tareas: tareasPrincipal, workers: 0 },
  };
}

let compartido: Promise<Motor> | null = null;

/** Atajo con un motor compartido perezoso (opciones por omisión). */
export async function leerDocumento(imagen: Uint8Array, opciones?: OpcionesLecturaMotor): Promise<ResultadoMotor> {
  compartido ??= crearMotor();
  return (await compartido).leerDocumento(imagen, opciones);
}

/** Cierra el motor compartido del atajo (si existe). */
export async function cerrarCompartido(): Promise<void> {
  const m = compartido;
  compartido = null;
  await (await m?.catch(() => null))?.cerrar();
}
