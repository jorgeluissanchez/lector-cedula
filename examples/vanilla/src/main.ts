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
