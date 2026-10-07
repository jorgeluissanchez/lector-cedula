/** CAM-02: comprobación del entorno antes de pedir la cámara. El contexto inseguro tiene prioridad. */
export type EstadoEntorno = "apto" | "contexto-inseguro" | "sin-soporte";

export interface Entorno {
  readonly contextoSeguro: boolean;
  readonly tieneGetUserMedia: boolean;
}

export const TEXTOS_ENTORNO: Readonly<Record<Exclude<EstadoEntorno, "apto">, string>> = Object.freeze({
  "contexto-inseguro": "La cámara solo funciona en una conexión segura (HTTPS).",
  "sin-soporte": "Este navegador no permite usar la cámara.",
});

export function evaluarEntorno(e: Entorno): EstadoEntorno {
  if (!e.contextoSeguro) return "contexto-inseguro";
  return e.tieneGetUserMedia ? "apto" : "sin-soporte";
}
