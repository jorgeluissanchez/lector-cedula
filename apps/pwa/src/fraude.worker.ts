/**
 * Worker de fraude de la PWA (deteccion-fraude, FRA-02, FRA-03): evalúa la señal en el dispositivo, sin red, y pone a
 * cero los frames recibidos (`evaluarYLiberar`). Responde solo con la señal, que no contiene datos ni píxeles.
 */
import { evaluarYLiberar } from "@lector-cedula/fraud";

interface Mensaje {
  tipo?: unknown;
  id?: unknown;
  frames?: unknown;
  cuadrilatero?: unknown;
  tipoDocumento?: unknown;
  datos?: unknown;
  ahora?: unknown;
}

self.addEventListener("message", (e: MessageEvent<Mensaje>) => {
  const m = e.data;
  if (typeof m !== "object" || m === null || m.tipo !== "evaluar" || typeof m.id !== "number") return;
  const frames = Array.isArray(m.frames)
    ? m.frames.map((f: { ancho?: unknown; alto?: unknown; pixeles?: unknown }) => ({
        width: f.ancho,
        height: f.alto,
        data: f.pixeles instanceof ArrayBuffer ? new Uint8ClampedArray(f.pixeles) : null,
      }))
    : [];
  const ahora = new Date(typeof m.ahora === "string" ? m.ahora : Number.NaN);
  // FRA-20: la PWA envía la guía de encuadre, no los bordes detectados de la tarjeta.
  const senal = evaluarYLiberar({ frames, cuadrilatero: m.cuadrilatero, cuadrilateroAproximado: true, tipo: m.tipoDocumento, datos: m.datos, reloj: () => ahora });
  self.postMessage({ tipo: "senal", id: m.id, senal });
});
