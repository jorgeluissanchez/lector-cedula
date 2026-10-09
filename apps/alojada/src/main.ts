// Página alojada `/v/{token}` (sdk-integracion, SDK-14, tarea 4.1). La sirve el microservicio con la configuración
// mínima de la sesión en `#config-sesion`; lee en el dispositivo con `@lector-cedula/web` (motor desde `/sdk/v1/`),
// sube la imagen con el token de la sesión y vuelve a `return_url` solo con `validation_id` y `estado`. La cámara no
// se pide hasta aceptar el aviso de autorización. Nada se guarda en el navegador.
import { crearLector, type ControladorLector, type EstadoLector } from "@lector-cedula/web";
import { leerConfiguracion, opcionesLector, pantallaDe, tokenDeRuta, urlRetorno } from "./logica.js";

const $ = <T extends HTMLElement>(s: string): T => document.querySelector(s) as T;
const raiz = $<HTMLElement>("main");
const anuncio = $<HTMLElement>("[data-prueba=anuncio]");

const MENSAJES: Record<string, string> = {
  captura: "Ubica el documento dentro del recuadro.",
  enviando: "Lectura terminada. Enviando…",
  completada: "Validación enviada.",
  fallo: "No se pudo enviar la validación.",
  error: "No se pudo leer el documento.",
  aviso: "Antes de continuar, lee la autorización.",
  "sesion-invalida": "Este enlace no es válido o ya venció.",
  fin: "Puedes cerrar esta ventana.",
};

function mostrar(pantalla: string, detalle = ""): void {
  raiz.dataset["pantalla"] = pantalla;
  for (const s of document.querySelectorAll<HTMLElement>("[data-seccion]")) s.hidden = s.dataset["seccion"] !== pantalla;
  anuncio.textContent = `${MENSAJES[pantalla] ?? ""}${detalle === "" ? "" : ` (${detalle})`}`;
}

const config = leerConfiguracion(document.getElementById("config-sesion")?.textContent ?? null);
const token = tokenDeRuta(location.pathname);

if (config.estado === "invalida" || token === null) {
  mostrar("sesion-invalida");
} else {
  const sesion = config;
  let lector: ControladorLector | null = null;
  let terminado = false;

  const volver = (estado: "completada" | "cancelada"): void => {
    if (terminado) return;
    terminado = true;
    lector?.destruir();
    lector = null;
    if (sesion.return_url === null) {
      mostrar("fin");
      return;
    }
    location.assign(urlRetorno(sesion.return_url, sesion.validation_id, estado));
  };

  $("[data-texto=version]").textContent = sesion.version_texto;
  $<HTMLElement>("[data-aviso=autorizacion-reforzada]").hidden = sesion.documento !== "tarjeta-identidad";
  mostrar("aviso");

  const video = $<HTMLVideoElement>("video");
  const guia = $<HTMLElement>("[data-prueba=guia]");
  const pintar = (e: EstadoLector): void => {
    if (terminado) return;
    const p = pantallaDe(e);
    if (p === "completada") {
      volver("completada");
      return;
    }
    mostrar(p, p === "fallo" && e.envio?.estado === "fallido" ? e.envio.codigo : p === "error" ? (e.error?.codigo ?? "") : "");
    if (e.guia !== null && (e.fase === "activo" || e.fase === "listo")) {
      const n = e.guia.normalizada;
      Object.assign(guia.style, { display: "block", left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: `${n.ancho * 100}%`, height: `${n.alto * 100}%` });
    } else guia.style.display = "none";
  };

  const empezar = (): void => {
    lector?.destruir();
    lector = crearLector(opcionesLector(location.origin, token, sesion.documento));
    lector.suscribir(pintar);
    mostrar("captura");
    void lector.iniciar(video);
  };

  $("[data-accion=aceptar]").addEventListener("click", empezar);
  for (const b of document.querySelectorAll("[data-accion=reintentar]")) b.addEventListener("click", empezar);
  for (const b of document.querySelectorAll("[data-accion=cancelar]")) b.addEventListener("click", () => volver("cancelada"));
  addEventListener("pagehide", () => lector?.destruir());
}
