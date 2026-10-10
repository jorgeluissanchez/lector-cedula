/**
 * Ayudas de las E2E del panel de opciones de la demo (demo-opciones; plan: e2e/planes/demo-opciones.md). Build demo
 * (VITE_DEMO=true) en el puerto 4175; vídeos sintéticos de `npm run e2e:videos` (PERSONA_BASE y PERSONA_TI, NUIP
 * 9999123456). Fecha fija 2026-10-06 en Bogotá. Código de prueba, nunca de producto.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

export type VideoDemo = "amarilla-1080p" | "ti-amarilla-1080p" | "amarilla-de-pie-vertical" | "digital-de-pie-vertical";

export const conVideo = (v: VideoDemo) => ({ launchOptions: { args: [...ARGS, `--use-file-for-fake-video-capture=e2e/videos/sinteticos/${v}.y4m`] } });

export const NUIP = "9999123456";
export const CLAVE = "lector-cedula:demo-opciones";
export const ETIQUETAS_AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export const TEXTOS = {
  boton: "Opciones",
  region: "Opciones de la demostración",
  grupo: "Forma de la cámara",
  completa: "Pantalla completa",
  horizontal: "Recuadro horizontal",
  vertical: "Recuadro vertical (cédula de pie)",
  ti: "Admitir tarjeta de identidad (menores de edad)",
  notaTi: "Al leer el documento de un menor se pedirá la autorización de su representante legal antes de mostrar los datos.",
  fraude: "Señal de fraude",
  notaFraude: "Señal orientativa calculada en tu dispositivo; no confirma la autenticidad del documento.",
  recordadas: "Estas preferencias se recuerdan en este navegador. Ningún dato del documento se guarda.",
  dePie: "Sostén la cédula de pie, sin girar el teléfono.",
} as const;

export const contenedor = (page: Page) => page.locator("[data-pantalla]");
export const botonOpciones = (page: Page) => page.getByRole("button", { name: TEXTOS.boton, exact: true });
export const region = (page: Page) => page.getByRole("region", { name: TEXTOS.region });

export async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(ETIQUETAS_AXE).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

export async function abrirDemo(page: Page, ruta = "/"): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-10-06T12:00:00-05:00"));
  await page.goto(ruta);
  await expect(contenedor(page)).toHaveAttribute("data-pantalla", "inicio");
}

/** Abre el panel (si está cerrado) y devuelve la región. */
export async function abrirPanel(page: Page) {
  if ((await botonOpciones(page).getAttribute("aria-expanded")) !== "true") await botonOpciones(page).click();
  await expect(region(page)).toBeVisible();
  return region(page);
}

export async function esperarPantalla(page: Page, pantalla: string, timeout = 30_000): Promise<void> {
  await expect(contenedor(page)).toHaveAttribute("data-pantalla", pantalla, { timeout });
}

/** OFF-21: marca la autorización del titular y pulsa "Iniciar cámara". */
export async function iniciarCamara(page: Page): Promise<void> {
  await page.getByRole("checkbox", { name: /^Autorizo/u }).check();
  await page.getByRole("button", { name: "Iniciar cámara" }).click();
}

export const campo = (page: Page, etiqueta: string) => page.getByLabel(etiqueta, { exact: true });

export async function almacenamiento(page: Page): Promise<{ claves: string[]; valor: string | null; sesion: number; idb: unknown[] }> {
  return page.evaluate(async (clave) => ({
    claves: Object.keys(localStorage),
    valor: localStorage.getItem(clave),
    sesion: sessionStorage.length,
    idb: await indexedDB.databases(),
  }), CLAVE);
}

/** Emula un teléfono de pie: intercambia `width` y `height` de las restricciones de vídeo (como e2e/login/ayudas.ts). */
export async function telefonoDePie(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const medios = navigator.mediaDevices;
    const original = medios.getUserMedia.bind(medios);
    medios.getUserMedia = (c?: MediaStreamConstraints) => {
      const v = c?.video;
      if (typeof v !== "object" || v === null) return original(c);
      const { width, height, ...resto } = v;
      return original({ ...c, video: { ...resto, ...(height === undefined ? {} : { width: height }), ...(width === undefined ? {} : { height: width }) } });
    };
  });
}

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Escena {
  readonly forma: string | null;
  readonly guia: Caja;
  readonly video: Caja;
  readonly recuadro: Caja | null;
  readonly ventana: { readonly ancho: number; readonly alto: number };
  readonly objectFit: string;
  readonly pista: [number, number];
  readonly dePie: boolean;
}

/**
 * Registra en cada frame la última escena de `activo` con guía visible (la lectura puede terminar muy rápido): forma,
 * cajas de la guía, del vídeo y del recuadro, `object-fit`, tamaño de la pista y el texto de "de pie". Llamar antes de
 * iniciar la cámara.
 */
export async function vigilarEscena(page: Page): Promise<void> {
  await page.evaluate((textoDePie) => {
    const w = window as unknown as { __escena?: unknown };
    const caja = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    const paso = (): void => {
      const escena = document.querySelector(".escena");
      const g = document.querySelector(".guia");
      const v = document.querySelector(".escena video") as HTMLVideoElement | null;
      if (escena !== null && g !== null && v !== null && v.videoWidth > 0) {
        const r = document.querySelector(".recuadro");
        w.__escena = {
          forma: escena.getAttribute("data-forma"),
          guia: caja(g.getBoundingClientRect()),
          video: caja(v.getBoundingClientRect()),
          recuadro: r === null ? null : caja(r.getBoundingClientRect()),
          ventana: { ancho: innerWidth, alto: innerHeight },
          objectFit: getComputedStyle(v).objectFit,
          pista: [v.videoWidth, v.videoHeight],
          dePie: [...document.querySelectorAll(".indicacion")].some((p) => p.textContent === textoDePie),
        };
      }
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }, TEXTOS.dePie);
}

export async function ultimaEscena(page: Page): Promise<Escena | null> {
  return page.evaluate(() => ((window as unknown as { __escena?: unknown }).__escena ?? null) as never);
}

export function dentro(g: Caja, v: Caja): boolean {
  return g.x >= v.x - 1 && g.y >= v.y - 1 && g.x + g.width <= v.x + v.width + 1 && g.y + g.height <= v.y + v.height + 1;
}

/** Inicia la cámara, espera `resultado` y devuelve la última escena vista en `activo`. */
export async function leerConEscena(page: Page, timeout = 180_000): Promise<Escena> {
  await vigilarEscena(page);
  await iniciarCamara(page);
  await esperarPantalla(page, "resultado", timeout);
  const e = await ultimaEscena(page);
  expect(e, "la escena de activo no se registró").not.toBeNull();
  return e as Escena;
}
