// Worker de prueba con un detector sustituto (CAL-14): la detección se fija con el mensaje
// `{ tipo: "fijar-deteccion", detecciones }` (solo de prueba): cada llamada a `detectar` consume la siguiente y la
// última se repite. El resto de mensajes va al Worker de calidad real.
import type { DeteccionDocumento } from "../../src/calidad/tipos.js";
import { iniciarWorkerCalidad, type AlcanceWorker } from "../../src/navegador/worker-calidad.js";

const global = self as unknown as AlcanceWorker;
let detecciones: DeteccionDocumento[] = [{ cuadrilatero: null, confianza: null, fuente: "modelo" }];
let atender: AlcanceWorker["onmessage"] = null;

iniciarWorkerCalidad(
  {
    set onmessage(f: AlcanceWorker["onmessage"]) {
      atender = f;
    },
    get onmessage() {
      return atender;
    },
    postMessage: (m, t) => global.postMessage(m, t),
  },
  { id: "sustituto", detectar: () => (detecciones.length > 1 ? detecciones.shift() : detecciones[0]) as DeteccionDocumento },
);

global.onmessage = (e) => {
  const datos = e.data as { tipo?: unknown; detecciones?: DeteccionDocumento[] };
  if (datos.tipo === "fijar-deteccion" && datos.detecciones !== undefined) {
    detecciones = [...datos.detecciones];
    global.postMessage({ tipo: "configurado", id: -2, resultado: { ok: true } }, []);
    return;
  }
  atender?.(e);
};
