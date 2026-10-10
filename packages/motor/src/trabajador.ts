// MOT-04: worker del pool. Una instancia de Tesseract por worker (se reutiliza entre lecturas). Recibe la imagen como
// ArrayBuffer transferido (sin copia) y la pone a cero al terminar, también ante error (MOT-07). No escribe en consola.
import { parentPort, workerData } from "node:worker_threads";
import { crearLectorMrz } from "@lector-cedula/capture";
import { codigoErrorMotor } from "@lector-cedula/protocolo";
import { leerImagen } from "./leer.js";

interface DatosTrabajador {
  readonly rutaModelo: string;
  readonly llamadasOcrMaximas: number;
}

interface CargaLectura {
  readonly bytes: ArrayBuffer;
  readonly fechaReferencia: string;
  readonly admitirTarjetaIdentidad: boolean;
  readonly fraude: boolean;
}

const datos = workerData as DatosTrabajador;
const lector = crearLectorMrz({ rutaModelo: datos.rutaModelo, maxLlamadasOcr: datos.llamadasOcrMaximas });
const puerto = parentPort;

puerto?.on("message", async ({ id, carga }: { id: number; carga: CargaLectura }) => {
  const bytes = new Uint8Array(carga.bytes);
  try {
    const valor = await leerImagen(bytes, lector, { fechaReferencia: carga.fechaReferencia, admitirTarjetaIdentidad: carga.admitirTarjetaIdentidad, fraude: carga.fraude });
    puerto.postMessage({ id, ok: true, valor });
  } catch (error) {
    puerto.postMessage({ id, ok: false, error: { codigo: codigoErrorMotor(error) ?? "motor-error-interno" } });
  } finally {
    bytes.fill(0);
  }
});
