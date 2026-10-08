/**
 * Indicador de disponibilidad sin conexión (OFF-03) y comprobación de cuota (OFF-16; design.md, decisiones 9 y 10).
 * Empieza en `pendiente`; solo pasa a `lista` cuando el service worker activo responde `estado-precache: lista`.
 * Antes de registrar el service worker comprueba la cuota libre contra el presupuesto de la precaché (20 MiB, cota
 * superior de la suma del manifiesto) y pide almacenamiento persistente sin bloquear si se niega.
 */

export type EstadoOffline = "lista" | "pendiente";

export const TEXTOS_OFFLINE: Readonly<Record<EstadoOffline, string>> = Object.freeze({
  lista: "Lista para usar sin conexión",
  pendiente: "Sin conexión no disponible todavía",
});

/** OFF-16: tope de la suma de bytes del manifiesto de precaché. */
export const PRESUPUESTO_PRECACHE = 20_971_520;

export interface EntornoIndicador {
  readonly serviceWorker?:
    | {
        register(url: string, opciones: { scope: string }): Promise<unknown>;
        readonly ready: Promise<{ readonly active: { postMessage(m: unknown): void } | null }>;
        addEventListener(tipo: "message", f: (e: { data: unknown }) => void): void;
      }
    | undefined;
  readonly storage?: { estimate(): Promise<{ quota?: number; usage?: number }>; persist(): Promise<boolean> } | undefined;
}

export async function iniciarIndicador(entorno: EntornoIndicador, alCambiar: (estado: EstadoOffline) => void): Promise<void> {
  alCambiar("pendiente");
  const sw = entorno.serviceWorker;
  if (sw === undefined) return;
  try {
    if (entorno.storage !== undefined) {
      const { quota = 0, usage = 0 } = await entorno.storage.estimate();
      if (quota - usage < PRESUPUESTO_PRECACHE) return;
      await entorno.storage.persist().catch(() => false);
    }
    sw.addEventListener("message", (e) => {
      const d = e.data as { tipo?: unknown; estado?: unknown } | null;
      if (d?.tipo === "estado-precache" && (d.estado === "lista" || d.estado === "pendiente")) alCambiar(d.estado);
    });
    await sw.register("/sw.js", { scope: "/" });
    (await sw.ready).active?.postMessage({ tipo: "estado-precache" });
  } catch {
    // Sin service worker utilizable: el indicador sigue en `pendiente` y la lectura con conexión funciona igual.
  }
}
