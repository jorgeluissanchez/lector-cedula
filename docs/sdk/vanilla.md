# JavaScript sin framework

`crearLector(opciones, deps?)` de `@lector-cedula/web` devuelve un `ControladorLector`: `iniciar(video)`, `cancelar()`, `reintentar()`, `destruir()`, `obtenerEstado()` y `suscribir(fn)` (devuelve la función para desuscribirse). Nunca lanza por opciones inválidas: el estado pasa a `error` con `codigo: "opcion-invalida"` y `opcion`.

```sh
npm install @lector-cedula/web
```

## Ejemplo

<!-- ejemplo: examples/vanilla/src/main.ts -->
```ts
// Ejemplo headless sin framework ni servidor (sdk-integracion, tarea 3.4): la UI es del integrador; el núcleo solo
// entrega estado. Los assets del paquete se copian a `/lector-cedula/` (vite.config.ts) y el service worker del
// ejemplo los precachea con `precacheLector` para recargar sin red.
import { crearLector, precargarMotor, type EstadoLector } from "@lector-cedula/web";

const RECURSOS = new URL("/lector-cedula/", location.href).href;
const $ = <T extends Element>(s: string): T => document.querySelector(s) as T;
const video = $<HTMLVideoElement>("#video");
const guia = $<HTMLDivElement>("#guia");
const texto = (clave: string, valor: string): void => {
  $(`[data-prueba="${clave}"]`).textContent = valor;
};

function pintar(e: EstadoLector): void {
  texto("fase", e.fase);
  texto("calidad", e.calidad === null ? "" : `${e.calidad.score}${e.calidad.motivo === null ? "" : ` (${e.calidad.motivo})`}`);
  texto("contenido", e.contenido ?? "");
  texto("intento", String(e.intento));
  texto("nuip", e.resultado?.campos.nuip ?? "");
  texto("error", e.error?.codigo ?? "");
  texto("envio", e.envio === null ? "" : e.envio.estado === "fallido" ? `fallido:${e.envio.codigo}` : e.envio.estado);
  if (e.guia !== null && (e.fase === "activo" || e.fase === "listo")) {
    const n = e.guia.normalizada;
    Object.assign(guia.style, { display: "block", left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: `${n.ancho * 100}%`, height: `${n.alto * 100}%` });
  } else guia.style.display = "none";
}

// Envío opcional (SDK-38): solo si la página recibe ?servidor=...&sesion=... (por omisión, sin servidor).
const consulta = new URLSearchParams(location.search);
const servidor = consulta.get("servidor");
const sesion = consulta.get("sesion");
const OPCIONES = { recursos: RECURSOS, ...(servidor !== null && sesion !== null ? { servidor, sesion } : {}) };

let lector = crearLector(OPCIONES);
lector.suscribir(pintar);

$("[data-prueba=precargar]").addEventListener("click", () => {
  texto("motor", "cargando");
  precargarMotor({ recursos: RECURSOS }).then(
    () => texto("motor", "listo"),
    (e: { codigo?: string }) => texto("motor", e.codigo ?? "error"),
  );
});
$("[data-prueba=iniciar]").addEventListener("click", () => {
  void lector.iniciar(video);
});
$("[data-prueba=cancelar]").addEventListener("click", () => lector.cancelar());
$("[data-prueba=reintentar]").addEventListener("click", () => lector.reintentar());
$("[data-prueba=destruir]").addEventListener("click", () => {
  lector.destruir();
  pintar(lector.obtenerEstado());
  // Un lector nuevo para seguir usando la página.
  lector = crearLector(OPCIONES);
  lector.suscribir(pintar);
});

if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { type: "module" });
```

## Con backend propio

```ts
import { crearLector } from "@lector-cedula/web";

const lector = crearLector({ recursos: "/lector-cedula/", backend: "/api/cedula", modo: "front-back", validacion: "auto" });
lector.suscribir((e) => {
  if (e.fase === "resultado" && e.resultado?.confiable === true) {
    // El back ya confirmó y llamó a alConfirmar.
  }
});
```

## Leer una imagen sin cámara

`leerDocumento(entrada, opciones)` lee un archivo o imagen sin DOM de cámara. El resultado es solo de presentación (`confiable: false`).

## Service worker

`precacheLector(recursos)` de `@lector-cedula/web/sw` descarga y verifica el motor en la misma caché que usa el núcleo, para que la página recargada sin red siga leyendo:

<!-- ejemplo: examples/vanilla/src/sw.ts -->
```ts
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
```
