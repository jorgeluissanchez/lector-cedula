// Worker falso para las pruebas del pool (MOT-04, MOT-05): mismo protocolo que src/trabajador.ts.
// carga: { accion: "eco" | "dormir" | "salir" | "salir-luego" | "error" | "error-raro" | "progreso" | "argv" | "doble", ms?, bytes? }
import { parentPort, workerData } from "node:worker_threads";

parentPort.on("message", async ({ id, carga }) => {
  const { accion, ms = 0 } = carga;
  if (accion === "salir") process.exit(1);
  if (accion === "progreso") parentPort.postMessage({ id, progreso: 0.5 });
  // Mensaje con otro id (de una tarea anterior): el pool lo debe ignorar.
  if (accion === "doble") parentPort.postMessage({ id: id + 1000, ok: true, valor: "ajeno" });
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  if (accion === "error") return parentPort.postMessage({ id, ok: false, error: { codigo: "formato-no-soportado" } });
  if (accion === "error-raro") return parentPort.postMessage({ id, ok: false, error: { codigo: "inventado" } });
  if (accion === "argv") return parentPort.postMessage({ id, ok: true, valor: { execArgv: process.execArgv, datos: workerData ?? null } });
  const bytes = carga.bytes instanceof ArrayBuffer ? new Uint8Array(carga.bytes) : null;
  const suma = bytes ? bytes.reduce((a, b) => a + b, 0) : 0;
  bytes?.fill(0);
  parentPort.postMessage({ id, ok: true, valor: { accion, suma } });
  // Muere sin tarea en curso (caída entre lecturas).
  if (accion === "salir-luego") setTimeout(() => process.exit(1), 20);
});
