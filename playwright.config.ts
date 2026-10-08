import { defineConfig, devices, type Project } from "@playwright/test";

/**
 * Pruebas E2E en navegador. La cámara se simula con un dispositivo falso de Chromium alimentado con vídeos sintéticos
 * .y4m (`npm run e2e:videos`; captura-calidad-pwa, design.md, decisiones 11, 12 y 15).
 */
const VIDEOS = ["nitida-1080p", "desenfocada-1080p", "reflejo-1080p", "sobreexpuesta-1080p", "oscura-1080p", "nitida-720p"] as const;
const DISPOSITIVOS = { escritorio: devices["Desktop Chrome"], pixel: devices["Pixel 7"] } as const;
const VISUAL = process.env.VISUAL === "1";
// WebKit no arranca en este Windows (faltan dependencias del sistema): el proyecto solo existe fuera de Windows,
// es decir, dentro del contenedor de Playwright (npm run test:webkit).
const CON_WEBKIT = process.platform !== "win32";
const CAMARA = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

const proyectosCaptura: Project[] = VIDEOS.flatMap((video) =>
  Object.entries(DISPOSITIVOS).map(([nombre, dispositivo]) => ({
    name: `captura-${video}-${nombre}`,
    testMatch: /captura\/.*\.spec\.ts/,
    testIgnore: /captura\/webkit\.spec\.ts/,
    grep: new RegExp(`@video:${video}\\b`),
    ...(VISUAL ? {} : { grepInvert: /@visual/ }),
    use: {
      ...dispositivo,
      baseURL: "http://localhost:4173",
      launchOptions: { args: [...CAMARA, `--use-file-for-fake-video-capture=e2e/videos/sinteticos/${video}.y4m`] },
    },
  })),
);

// Lectura en el dispositivo (pwa-lectura-offline, tarea 1.1): un proyecto por dispositivo. Cada spec elige su vídeo
// (amarilla-1080p, digital-1080p, digital-girada-90-1080p) con `test.use({ launchOptions })` por describe, y se graba
// vídeo de la ejecución por proyecto cuando falla.
const proyectosLectura: Project[] = [
  { name: "lectura-chromium", dispositivo: DISPOSITIVOS.escritorio },
  { name: "lectura-pixel7", dispositivo: DISPOSITIVOS.pixel },
].map(({ name, dispositivo }) => ({
  name,
  testDir: "e2e/lectura",
  use: { ...dispositivo, baseURL: "http://localhost:4173", video: "retain-on-failure", launchOptions: { args: CAMARA } },
}));

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "reports/playwright" }]],
  snapshotPathTemplate: "e2e/visual/assets-ui/{testFileName}/{arg}-{projectName}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  webServer: [
    {
      command: "npm run build -w apps/pwa && npm run preview -w apps/pwa -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 400_000,
    },
    // despliegue-produccion (DP-07): el mismo build con exactamente las cabeceras de vercel.json.
    { command: "node tools/despliegue/servir-vercel.mjs 4180", url: "http://localhost:4180", reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    permissions: ["camera"],
    launchOptions: { args: CAMARA },
  },
  projects: [
    { name: "chromium-escritorio", testIgnore: [/captura\//, /lectura[\\/]/, /despliegue[\\/]/], use: { ...devices["Desktop Chrome"] } },
    { name: "android-pixel", testIgnore: [/captura\//, /lectura[\\/]/, /despliegue[\\/]/], use: { ...devices["Pixel 7"] } },
    ...proyectosCaptura,
    ...proyectosLectura,
    // despliegue-produccion (DP-07): PWA servida con las cabeceras de producción (CSP incluida).
    { name: "despliegue-chromium", testDir: "e2e/despliegue", use: { ...DISPOSITIVOS.escritorio, baseURL: "http://localhost:4180", launchOptions: { args: CAMARA } } },
    ...(CON_WEBKIT ? [{
      name: "captura-webkit",
      testMatch: /captura\/webkit\.spec\.ts/,
      use: { ...devices["Desktop Safari"], baseURL: "http://localhost:4173", permissions: [], launchOptions: { args: [] } },
    }] : []),
  ],
});
