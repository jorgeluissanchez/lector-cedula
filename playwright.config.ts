import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas E2E en navegador. La cámara se simula con un dispositivo falso de Chromium; en la Fase 2
 * se alimenta con vídeos sintéticos de cédulas (.y4m o .mjpeg) mediante --use-file-for-fake-video-capture.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "reports/playwright" }]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  projects: [
    { name: "chromium-escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "android-pixel", use: { ...devices["Pixel 7"] } },
  ],
});
