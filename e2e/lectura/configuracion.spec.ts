// Humo de configuración (pwa-lectura-offline, tarea 1.1): los proyectos de lectura existen, apuntan a la PWA de vista
// previa y graban vídeo al fallar. No abre ninguna página.
import { expect, test } from "@playwright/test";

test("proyecto de lectura configurado", ({ baseURL }, info) => {
  expect(info.project.name).toMatch(/^lectura-(chromium|pixel7)$/);
  expect(baseURL).toBe("http://localhost:4173");
  expect(info.project.use.video).toBe("retain-on-failure");
});
