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
  // E2E_SIN_SERVIDORES=1: suites que traen su propio servidor (e2e/sdk/alojado.spec.ts contra api-pruebas en Docker) no
  // compilan ni levantan los servidores locales.
  webServer: process.env.E2E_SIN_SERVIDORES === "1" ? [] : [
    {
      command: "npm run build -w apps/pwa && npm run preview -w apps/pwa -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 400_000,
    },
    // mitigacion-autor (MA-02, MA-03): build de la demo (VITE_DEMO=true) en dist-demo, sin pisar dist.
    {
      command: "npm run build -w apps/pwa -- --outDir dist-demo && npm run preview -w apps/pwa -- --outDir dist-demo --port 4175 --strictPort",
      url: "http://localhost:4175",
      reuseExistingServer: !process.env.CI,
      timeout: 400_000,
      env: { VITE_DEMO: "true" },
    },
    // despliegue-produccion (DP-07): el mismo build con exactamente las cabeceras de vercel.json.
    { command: "node tools/despliegue/servir-vercel.mjs 4180", url: "http://localhost:4180", reuseExistingServer: !process.env.CI, timeout: 60_000 },
    // sdk-integracion (tarea 3.4): ejemplo headless sin servidor con los assets del paquete copiados.
    {
      command: "npm run build -w @lector-cedula/web && npx vite build examples/vanilla && npx vite preview examples/vanilla --port 4190 --strictPort",
      url: "http://localhost:4190",
      reuseExistingServer: !process.env.CI,
      timeout: 400_000,
    },
    // motor-backend-embebido (tarea 1.5) y sdk-integracion (B.7): ejemplo React + backend Express con el motor en proceso.
    {
      command: "npm run build -w @lector-cedula/web && npx tsc -b packages/react packages/servidor packages/motor && npm run build -w examples/backend-express && npm run start -w examples/backend-express",
      url: "http://localhost:4195/",
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: { PORT: "4195" },
    },
    // sdk-integracion (SDK-64): ejemplo de login con la cámara en un recuadro embebido.
    {
      command: "npm run build -w @lector-cedula/web && npx tsc -b packages/react && npm run build -w examples/login && npm run preview -w examples/login",
      url: "http://localhost:4196",
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
    },
    // sdk-integracion (tarea 3b.4): ejemplos por framework compilados, sin servidor del lector.
    ...[
      { puerto: 4191, comando: "npm run build -w examples/react && npm run preview -w examples/react" },
      { puerto: 4192, comando: "npm run build -w examples/next && npm run start -w examples/next" },
      { puerto: 4193, comando: "npm run build -w examples/angular && npm run preview -w examples/angular" },
      { puerto: 4194, comando: "npm run build -w examples/vue && npm run preview -w examples/vue" },
    ].map(({ puerto, comando }) => ({
      command: `npm run build -w @lector-cedula/web && npx tsc -b packages/react packages/angular packages/vue && ${comando}`,
      url: `http://localhost:${puerto}`,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: { NEXT_TELEMETRY_DISABLED: "1", NG_CLI_ANALYTICS: "false" },
    })),
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    permissions: ["camera"],
    launchOptions: { args: CAMARA },
  },
  projects: [
    { name: "chromium-escritorio", testIgnore: [/captura\//, /lectura[\\/]/, /despliegue[\\/]/, /sdk[\\/]/, /demo[\\/]/, /backend[\\/]/, /login[\\/]/], use: { ...devices["Desktop Chrome"] } },
    { name: "android-pixel", testIgnore: [/captura\//, /lectura[\\/]/, /despliegue[\\/]/, /sdk[\\/]/, /demo[\\/]/, /backend[\\/]/, /login[\\/]/], use: { ...devices["Pixel 7"] } },
    // sdk-integracion (SDK-64): ejemplo de login (recuadros 260x400 y 320x200); cada describe elige su vídeo.
    ...[
      { name: "login-chromium", dispositivo: DISPOSITIVOS.escritorio },
      { name: "login-pixel7", dispositivo: DISPOSITIVOS.pixel },
    ].map(({ name, dispositivo }) => ({
      name,
      testDir: "e2e/login",
      use: { ...dispositivo, video: "retain-on-failure" as const, launchOptions: { args: CAMARA } },
    })),
    // motor-backend-embebido (tarea 1.5): front React + backend Express real con la amarilla sintética.
    ...[
      { name: "backend-chromium", dispositivo: DISPOSITIVOS.escritorio },
      { name: "backend-pixel7", dispositivo: DISPOSITIVOS.pixel },
    ].map(({ name, dispositivo }) => ({
      name,
      testDir: "e2e/backend",
      use: { ...dispositivo, video: "retain-on-failure" as const, launchOptions: { args: [...CAMARA, "--use-file-for-fake-video-capture=e2e/videos/sinteticos/amarilla-1080p.y4m"] } },
    })),
    // sdk-integracion (tarea 3.4): núcleo headless sobre examples/vanilla; cada spec elige su vídeo.
    ...[
      { name: "sdk-chromium", dispositivo: DISPOSITIVOS.escritorio },
      { name: "sdk-pixel7", dispositivo: DISPOSITIVOS.pixel },
    ].map(({ name, dispositivo }) => ({
      name,
      testDir: "e2e/sdk",
      testIgnore: /ejemplos\.spec\.ts/,
      use: { ...dispositivo, baseURL: "http://localhost:4190", video: "retain-on-failure" as const, launchOptions: { args: CAMARA } },
    })),
    // sdk-integracion (tarea 3b.4): los ejemplos por framework, cada uno en su puerto.
    { name: "sdk-ejemplos", testDir: "e2e/sdk", testMatch: /ejemplos\.spec\.ts/, use: { ...DISPOSITIVOS.escritorio, video: "retain-on-failure", launchOptions: { args: CAMARA } } },
    ...proyectosCaptura,
    ...proyectosLectura,
    // mitigacion-autor (MA-02, MA-03): aviso de la demo y ausencia de envíos.
    { name: "demo-chromium", testDir: "e2e/demo", use: { ...DISPOSITIVOS.escritorio, baseURL: "http://localhost:4175", launchOptions: { args: CAMARA } } },
    // despliegue-produccion (DP-07): PWA servida con las cabeceras de producción (CSP incluida).
    { name: "despliegue-chromium", testDir: "e2e/despliegue", use: { ...DISPOSITIVOS.escritorio, baseURL: "http://localhost:4180", launchOptions: { args: CAMARA } } },
    ...(CON_WEBKIT ? [{
      name: "captura-webkit",
      testMatch: /captura\/webkit\.spec\.ts/,
      use: { ...devices["Desktop Safari"], baseURL: "http://localhost:4173", permissions: [], launchOptions: { args: [] } },
    }] : []),
  ],
});
