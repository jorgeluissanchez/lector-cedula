// CAM-07 "Motor WebKit": getUserMedia sustituido por canvas.captureStream() de un canvas de 1920x1080 con la escena
// nítida sintética (fondo #303030 y rectángulos de gris 40..200 con semilla fija dentro de la guía; design.md,
// decisión 11). Instrumentación de prueba, nunca código de producto.
import { expect, test } from "@playwright/test";

test.describe("WebKit", { timeout: 60_000 }, () => {
  test("CAM-07 Motor WebKit", async ({ page }) => {
    await page.addInitScript(() => {
      const lienzo = document.createElement("canvas");
      lienzo.width = 1920;
      lienzo.height = 1080;
      const ctx = lienzo.getContext("2d") as CanvasRenderingContext2D;
      let semilla = 12345;
      const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
      const rects: [number, number, number, number, number][] = [];
      for (let i = 0; i < 400; i++) {
        const w = 10 + Math.floor(azar() * 120);
        const h = 10 + Math.floor(azar() * 120);
        rects.push([190 + Math.floor(azar() * (1541 - w)), 54 + Math.floor(azar() * (972 - h)), w, h, 40 + Math.floor(azar() * 161)]);
      }
      const pintar = () => {
        ctx.fillStyle = "#303030";
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.fillStyle = "rgb(120,120,120)";
        ctx.fillRect(190, 54, 1541, 972);
        for (const [x, y, w, h, g] of rects) {
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(x, y, w, h);
        }
      };
      pintar();
      setInterval(pintar, 100);
      const medios = navigator.mediaDevices ?? ({} as MediaDevices);
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: medios });
      Object.defineProperty(medios, "getUserMedia", {
        configurable: true,
        value: async () => lienzo.captureStream(10),
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Iniciar cámara" }).click();
    await expect(page.locator("[data-pantalla]")).toHaveAttribute("data-pantalla", "listo", { timeout: 30_000 });
  });
});
