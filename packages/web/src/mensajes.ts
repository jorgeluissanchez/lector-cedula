/** Textos de `error.mensaje` (SDK-27). `idioma` solo afecta a estos textos; nunca llevan datos del documento. */
import type { CodigoError, Idioma } from "./tipos.js";

const ES: Readonly<Record<CodigoError, string>> = {
  "opcion-invalida": "La configuración del lector no es válida.",
  "entorno-no-soportado": "Este navegador no permite usar la cámara aquí (se necesita HTTPS).",
  "camara-denegada": "Permite el acceso a la cámara para continuar.",
  "camara-no-disponible": "No encontramos una cámara disponible.",
  "camara-ocupada": "La cámara está en uso por otra aplicación.",
  "camara-error": "No pudimos iniciar la cámara.",
  "motor-no-disponible": "No se pudo cargar el lector en este dispositivo.",
  "lectura-fallida": "No se pudo leer el documento. Acércalo y evita reflejos.",
  "menor-de-edad": "Este lector no admite documentos de menores de edad.",
  "documento-no-admitido": "Este tipo de documento no está admitido.",
  "calidad-error": "El análisis de la imagen se detuvo. Vuelve a intentarlo.",
};

const EN: Readonly<Record<CodigoError, string>> = {
  "opcion-invalida": "The reader configuration is not valid.",
  "entorno-no-soportado": "This browser cannot use the camera here (HTTPS is required).",
  "camara-denegada": "Allow camera access to continue.",
  "camara-no-disponible": "No camera was found.",
  "camara-ocupada": "The camera is in use by another application.",
  "camara-error": "The camera could not be started.",
  "motor-no-disponible": "The reader could not be loaded on this device.",
  "lectura-fallida": "The document could not be read. Move closer and avoid glare.",
  "menor-de-edad": "This reader does not accept documents of minors.",
  "documento-no-admitido": "This document type is not accepted.",
  "calidad-error": "Image analysis stopped. Please try again.",
};

export function mensaje(codigo: CodigoError, idioma: Idioma = "es"): string {
  return (idioma === "en" ? EN : ES)[codigo];
}
