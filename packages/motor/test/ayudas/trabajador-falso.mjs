// Worker falso para las pruebas del pool (MOT-04, MOT-05): mismo protocolo que src/trabajador.ts.
// carga: { accion: "eco" | "dormir" | "salir" | "error" | "progreso", ms?, bytes? }
import { parentPort } from "node:worker_threads";

parentPort.on("message", async ({ id, carga }) => {
  const { accion, ms = 0 } = carga;
  if (accion === "salir") process.exit(1);
  if (accion === "progreso") {
    parentPort.postMessage({ id, progreso: 0.5 });
  }
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  if (accion === "error") return parentPort.postMessage({ id, ok: false, error: { codigo: "formato-no-soportado" } });
  const bytes = carga.bytes instanceof ArrayBuffer ? new Uint8Array(carga.bytes) : null;
  const suma = bytes ? bytes.reduce((a, b) => a + b, 0) : 0;
  bytes?.fill(0);
  parentPort.postMessage({ id, ok: true, valor: { accion, suma } });
});
