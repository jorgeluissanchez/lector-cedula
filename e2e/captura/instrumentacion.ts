/**
 * Instrumentación común de las E2E de captura (design.md, decisión 12). Código de prueba inyectado con
 * `page.addInitScript`: espías de `getUserMedia`, `applyConstraints` e `ImageCapture`, registro de streams y
 * redefinición de `visibilityState`. Nunca es código de producto.
 */
import { expect, type Page } from "@playwright/test";

export interface OpcionesInstrumentacion {
  /** La primera llamada a getUserMedia rechaza con NotAllowedError (CAM-05). */
  readonly rechazarPrimera?: boolean;
  /** Elimina navigator.mediaDevices.getUserMedia (CAM-02). */
  readonly sinGetUserMedia?: boolean;
  /** Sustituye getCapabilities de las pistas (CAM-06); "ausente" la elimina. */
  readonly capacidades?: { readonly focusMode: readonly string[] } | "ausente";
  /** applyConstraints rechaza con OverconstrainedError (CAM-06). */
  readonly rechazarApplyConstraints?: boolean;
}

export interface Registro {
  readonly llamadas: unknown[];
  readonly applyConstraints: unknown[];
  readonly imageCapture: number;
}

declare global {
  interface Window {
    __espia: { llamadas: unknown[]; streams: MediaStream[]; applyConstraints: unknown[]; imageCapture: number };
    __visibilidad: (estado: "hidden" | "visible") => void;
  }
}

export async function instrumentar(page: Page, opciones: OpcionesInstrumentacion = {}): Promise<void> {
  await page.addInitScript((o: OpcionesInstrumentacion) => {
    const espia = { llamadas: [] as unknown[], streams: [] as MediaStream[], applyConstraints: [] as unknown[], imageCapture: 0 };
    window.__espia = espia;

    // CAM-07: ImageCapture que cuenta sus usos.
    (window as unknown as { ImageCapture: unknown }).ImageCapture = function ImageCapture() {
      espia.imageCapture++;
    };

    const proto = MediaStreamTrack.prototype as unknown as Record<string, unknown>;
    if (o.capacidades === "ausente") {
      delete proto.getCapabilities;
    } else if (o.capacidades !== undefined) {
      const c = o.capacidades;
      proto.getCapabilities = () => ({ focusMode: [...c.focusMode] });
    }
    const aplicarOriginal = MediaStreamTrack.prototype.applyConstraints;
    MediaStreamTrack.prototype.applyConstraints = function (this: MediaStreamTrack, r?: MediaTrackConstraints) {
      espia.applyConstraints.push(JSON.parse(JSON.stringify(r ?? null)));
      if (o.rechazarApplyConstraints) return Promise.reject(new DOMException("x", "OverconstrainedError"));
      return aplicarOriginal.call(this, r).catch(() => undefined);
    };

    const medios = navigator.mediaDevices;
    if (medios !== undefined) {
      if (o.sinGetUserMedia) {
        Object.defineProperty(medios, "getUserMedia", { value: undefined, configurable: true });
      } else {
        const original = medios.getUserMedia.bind(medios);
        Object.defineProperty(medios, "getUserMedia", {
          configurable: true,
          value: async (r: MediaStreamConstraints) => {
            espia.llamadas.push(JSON.parse(JSON.stringify(r)));
            if (o.rechazarPrimera && espia.llamadas.length === 1) throw new DOMException("denegado", "NotAllowedError");
            const s = await original(r);
            espia.streams.push(s);
            return s;
          },
        });
      }
    }

    // CAM-10: redefinición de document.visibilityState.
    let visibilidad: "hidden" | "visible" = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidad });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => visibilidad === "hidden" });
    window.__visibilidad = (estado) => {
      visibilidad = estado;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  }, opciones);
}

export const contenedor = (page: Page) => page.locator("[data-pantalla]");

export async function registro(page: Page): Promise<Registro> {
  return page.evaluate(() => ({ llamadas: window.__espia.llamadas, applyConstraints: window.__espia.applyConstraints, imageCapture: window.__espia.imageCapture }));
}

/** Estados de todas las pistas de los streams devueltos por getUserMedia. */
export async function estadosPistas(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__espia.streams.flatMap((s) => s.getTracks().map((p) => p.readyState)));
}

export async function iniciarCamara(page: Page): Promise<void> {
  // OFF-21: la casilla de autorización habilita "Iniciar cámara".
  await page.getByRole("checkbox", { name: /^Autorizo/u }).check();
  await page.getByRole("button", { name: "Iniciar cámara" }).click();
}

/**
 * `listo` es transitorio hacia la lectura (pwa-lectura-offline, OFF-19; delta MODIFIED de CAM-01, CAM-09, CAM-10 y
 * CAM-11): "llegar a `listo`" se comprueba aceptando `listo` o cualquier pantalla de lectura, a las que el reductor
 * solo llega desde `listo` (prueba unitaria apps/pwa/test/off-19-estado.test.ts).
 */
export const PANTALLAS_TRAS_LISTO = /^(listo|leyendo|resultado|error-lectura)$/;

/**
 * Registra cada texto que toma la región de estado de la captura (`.estado`) desde la carga: "Listo" es transitorio
 * porque la lectura empieza sola (OFF-19).
 */
export async function registrarTextosEstado(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __textosEstado: string[] };
    w.__textosEstado = [];
    new MutationObserver(() => {
      const t = document.querySelector(".estado")?.textContent ?? "";
      if (t !== "" && w.__textosEstado.at(-1) !== t) w.__textosEstado.push(t);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

export const textosEstado = (page: Page) => page.evaluate(() => (window as unknown as { __textosEstado: string[] }).__textosEstado);

/** Región de estado de la captura (en `inicio` también existe el indicador sin conexión de OFF-03, otro `status`). */
export const regionEstado = (page: Page) => page.getByRole("status").and(page.locator(".estado"));

export async function esperarPantalla(page: Page, pantalla: string, timeout = 20_000): Promise<void> {
  await expect(contenedor(page)).toHaveAttribute("data-pantalla", pantalla === "listo" ? PANTALLAS_TRAS_LISTO : pantalla, { timeout });
}

/** Expresión de CAM-01 para las rutas permitidas. */
export const RUTA_PERMITIDA = /^\/(index\.html|manifest\.webmanifest|sw\.js|iconos\/[^/]+\.png|assets\/[^/]+)?$/;

/** Espera `n` cuadros de animación de la página: ventana de observación por condición, sin tiempo fijo. */
export async function esperarCuadros(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let k = 0;
        const paso = () => (++k >= total ? resolve() : requestAnimationFrame(paso));
        requestAnimationFrame(paso);
      }),
    n,
  );
}

/** Número de medidas `calidad:frame` registradas hasta ahora. */
export async function medidasCalidad(page: Page): Promise<number> {
  return page.evaluate(() => performance.getEntriesByName("calidad:frame", "measure").length);
}
