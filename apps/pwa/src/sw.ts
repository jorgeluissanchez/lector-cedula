/**
 * Service worker de la PWA (CAM-01; design.md, decisión 10). Precarga en `install` la lista fija de recursos
 * estáticos, borra cachés viejas en `activate` y en `fetch` solo responde desde caché a GET del mismo origen cuya
 * ruta está en la lista. Todo lo demás va a la red sin tocar la caché: no hay caché en tiempo de ejecución.
 */
interface EventoExtensible extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface EventoFetch extends EventoExtensible {
  readonly request: Request;
  respondWith(r: Promise<Response>): void;
}
interface AlcanceSw {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(tipo: "install" | "activate", f: (e: EventoExtensible) => void): void;
  addEventListener(tipo: "fetch", f: (e: EventoFetch) => void): void;
}

declare const __RECURSOS__: readonly string[];
declare const __VERSION__: string;

const alcance = self as unknown as AlcanceSw;
const RECURSOS: readonly string[] = __RECURSOS__;
const CACHE = `shell-${__VERSION__}`;

alcance.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([...RECURSOS]))
      .then(() => alcance.skipWaiting()),
  );
});

alcance.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => alcance.clients.claim()),
  );
});

alcance.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== alcance.location.origin || !RECURSOS.includes(url.pathname)) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => (await c.match(url.pathname)) ?? fetch(e.request)),
  );
});
