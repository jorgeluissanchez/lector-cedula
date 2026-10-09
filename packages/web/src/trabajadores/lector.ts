// Worker lector del núcleo (SDK-04): se empaqueta en `assets/lector.js` y se crea desde una URL blob verificada. El
// primer mensaje trae las rutas blob del resto de recursos; después atiende `leer` y `cancelar` como el de la PWA.
import { iniciarWorkerLector, type AlcanceLector, type RutasLector } from "@lector-cedula/capture";

const alcance = self as unknown as AlcanceLector;
alcance.onmessage = (e) => {
  const d = e.data as { tipo?: unknown; rutas?: RutasLector } | null;
  if (d?.tipo === "rutas" && d.rutas !== undefined) iniciarWorkerLector(alcance, d.rutas);
};
