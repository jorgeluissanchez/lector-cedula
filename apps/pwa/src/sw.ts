/**
 * Service worker de la PWA (CAM-01; pwa-lectura-offline, OFF-01 a OFF-05 y OFF-17; design.md, decisiones 7, 9 y 10).
 * El manifiesto de precaché (rutas, bytes y SHA-256) se inyecta al compilar (`__MANIFIESTO__`, sin petición extra).
 * `install`: precaché completa y verificada; si algo falla, no se activa. `activate`: borra las demás cachés.
 * `fetch`: solo GET del mismo origen con ruta del manifiesto, desde la caché; nada se guarda en tiempo de ejecución.
 * `message` `estado-precache`: responde `lista` o `pendiente` (OFF-03). Toda la lógica está en `precache/instalar.ts`.
 */
import { activar, estadoPrecache, instalar, responderFetch, type AlmacenCaches } from "./precache/instalar";
import type { ManifiestoPrecache } from "./precache/manifiesto";

interface EventoExtensible extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface EventoFetch extends EventoExtensible {
  readonly request: Request;
  respondWith(r: Promise<Response>): void;
}
interface EventoMensaje extends EventoExtensible {
  readonly data: unknown;
  readonly source: { postMessage(m: unknown): void } | null;
}
interface AlcanceSw {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(tipo: "install" | "activate", f: (e: EventoExtensible) => void): void;
  addEventListener(tipo: "fetch", f: (e: EventoFetch) => void): void;
  addEventListener(tipo: "message", f: (e: EventoMensaje) => void): void;
}

declare const __MANIFIESTO__: ManifiestoPrecache;

const alcance = self as unknown as AlcanceSw;
const MANIFIESTO: ManifiestoPrecache = __MANIFIESTO__;
const RUTAS: ReadonlySet<string> = new Set(MANIFIESTO.entradas.map((e) => e.ruta));
const almacen = caches as unknown as AlmacenCaches;

alcance.addEventListener("install", (e) => {
  e.waitUntil(
    instalar(MANIFIESTO, {
      almacen,
      descargar: (ruta, opciones) => fetch(ruta, opciones),
      // Solo el motivo y la ruta, nunca el contenido (OFF-02).
      registrar: (motivo, ruta) => console.error(motivo, ruta),
    }).then(() => alcance.skipWaiting()),
  );
});

alcance.addEventListener("activate", (e) => {
  e.waitUntil(activar(MANIFIESTO, almacen).then(() => alcance.clients.claim()));
});

alcance.addEventListener("fetch", (e) => {
  const respuesta = responderFetch(e.request, alcance.location.origin, RUTAS, almacen, MANIFIESTO.version, (ruta) => fetch(ruta));
  if (respuesta !== null) e.respondWith(respuesta);
});

alcance.addEventListener("message", (e) => {
  if ((e.data as { tipo?: unknown } | null)?.tipo !== "estado-precache") return;
  e.waitUntil(estadoPrecache(MANIFIESTO, almacen).then((estado) => e.source?.postMessage({ tipo: "estado-precache", estado })));
});
