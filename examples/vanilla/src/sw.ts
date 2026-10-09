// Service worker del ejemplo (SDK-06): precachea el motor del lector y sirve la página sin red. La caché de la página
// es del integrador; la del motor la gestiona `precacheLector` (`lector-cedula-sdk-<version>`) y el núcleo la lee.
import { precacheLector } from "@lector-cedula/web/sw";

interface Evento extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface EventoFetch extends Evento {
  readonly request: Request;
  respondWith(r: Promise<Response>): void;
}
interface Alcance {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(t: "install" | "activate", f: (e: Evento) => void): void;
  addEventListener(t: "fetch", f: (e: EventoFetch) => void): void;
}

declare const __PAGINA__: string[];
const alcance = self as unknown as Alcance;
const CACHE_PAGINA = "ejemplo-vanilla-pagina";

alcance.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([precacheLector(new URL("/lector-cedula/", alcance.location.href).href), caches.open(CACHE_PAGINA).then((c) => c.addAll(__PAGINA__))]).then(() =>
      alcance.skipWaiting(),
    ),
  );
});
alcance.addEventListener("activate", (e) => e.waitUntil(alcance.clients.claim()));
alcance.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== alcance.location.origin || url.pathname.startsWith("/lector-cedula/")) return;
  e.respondWith(caches.match(url.pathname === "/" ? "/index.html" : url.pathname).then((r) => r ?? fetch(e.request)));
});
