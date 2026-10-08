// OFF-15 Tiempos objetivo en Pixel 7 emulado (pwa-lectura-offline, tarea 7.1). Prueba de rendimiento:
// CPU 4x por CDP, sin conexión tras la primera visita, 20 lecturas por tipo; p95 y mediana en reports/lectura/tiempos.json
// (ignorado por git; solo números y etiquetas de tipo, nunca datos leídos).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { conVideo, esperarOfflineLista, esperarPantalla, esperarServiceWorker, iniciarCamara, type Video } from "./ayudas";

// OFF-15 exige 20; LECTURAS_OFF15 solo reduce la cuenta durante el desarrollo (máquina cargada).
const LECTURAS = Number(process.env.LECTURAS_OFF15 ?? 20);
const REPORTE = "reports/lectura/tiempos.json";
const TIPOS = [
  { tipo: "amarilla", video: "amarilla-1080p", p95: 1500 },
  { tipo: "digital", video: "digital-1080p", p95: 5000 },
  { tipo: "digital-girada", video: "digital-girada-90-1080p", p95: 10_000 },
] as const satisfies readonly { tipo: string; video: Video; p95: number }[];

/** Percentil por el método del rango más cercano (nearest-rank). */
function percentil(valores: readonly number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.max(0, Math.ceil((p / 100) * orden.length) - 1)] ?? Number.NaN;
}

function mediana(valores: readonly number[]): number {
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 0 ? ((o[m - 1] ?? 0) + (o[m] ?? 0)) / 2 : (o[m] ?? Number.NaN);
}

interface Entrada { readonly tipo: string; readonly medidas: number[]; readonly mediana: number; readonly p95: number; readonly umbralP95: number }

function anotar(entrada: Entrada): void {
  mkdirSync(dirname(REPORTE), { recursive: true });
  const previo = existsSync(REPORTE) ? (JSON.parse(readFileSync(REPORTE, "utf8")) as { tipos?: Entrada[] }) : {};
  const tipos = (previo.tipos ?? []).filter((t) => t.tipo !== entrada.tipo);
  tipos.push(entrada);
  writeFileSync(REPORTE, `${JSON.stringify({ cpu: 4, lecturas: LECTURAS, tipos }, null, 2)}\n`);
}

async function limitarCpu(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

/** Una lectura sin conexión: recarga desde caché, "Iniciar cámara", `resultado`, y devuelve la medida `lectura:tiempo`. */
async function medir(page: Page): Promise<number> {
  await page.reload();
  await limitarCpu(page);
  await expect(page.locator("[data-offline]")).toHaveAttribute("data-offline", "lista", { timeout: 60_000 });
  await iniciarCamara(page);
  await esperarPantalla(page, "resultado", 120_000);
  const medidas = await page.evaluate(() => performance.getEntriesByName("lectura:tiempo", "measure").map((m) => m.duration));
  expect(medidas).toHaveLength(1);
  return medidas[0] ?? Number.NaN;
}

test.describe.configure({ mode: "default" });

// Cada tipo necesita su propio vídeo de cámara simulada (argumento de lanzamiento), y Playwright no admite
// launchOptions por describe: la prueba lanza su propio Chromium con el dispositivo del proyecto.
// Sin page.clock: su reloj simulado sustituye a `performance` y ocultaría la medida lectura:tiempo.
for (const { tipo, video, p95 } of TIPOS) {
  test(`OFF-15 Presupuesto: p95 de ${LECTURAS} lecturas sin conexión con CPU 4x (${tipo}) <= ${p95} ms`, async ({ playwright }, info) => {
    test.setTimeout(LECTURAS * 150_000);
    const uso = info.project.use;
    const navegador = await playwright.chromium.launch({ args: conVideo(video).launchOptions.args });
    try {
      const context = await navegador.newContext({
        viewport: uso.viewport, userAgent: uso.userAgent, deviceScaleFactor: uso.deviceScaleFactor,
        isMobile: uso.isMobile, hasTouch: uso.hasTouch, baseURL: uso.baseURL, permissions: ["camera"],
      });
      const page = await context.newPage();
      await page.goto("/");
      await esperarServiceWorker(page);
      await esperarOfflineLista(page);
      await context.setOffline(true);
      const medidas: number[] = [];
      for (let i = 0; i < LECTURAS; i++) medidas.push(Math.round(await medir(page)));
      const entrada: Entrada = { tipo, medidas, mediana: mediana(medidas), p95: percentil(medidas, 95), umbralP95: p95 };
      anotar(entrada);
      expect(medidas.every((m) => Number.isFinite(m) && m > 0)).toBe(true);
      expect(entrada.p95).toBeLessThanOrEqual(p95);
    } finally {
      await navegador.close();
    }
  });
}
