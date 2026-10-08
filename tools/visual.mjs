#!/usr/bin/env node
// Regresión visual en el contenedor oficial de Playwright (captura-calidad-pwa, design.md, decisión 15).
// Uso: npm run test:visual [-- --update-snapshots]. Los .y4m se generan antes en el anfitrión (npm run e2e:videos).
// Con --webkit corre el proyecto captura-webkit (CAM-07): WebKit no arranca en este Windows por dependencias del sistema.
import { spawnSync } from "node:child_process";

const webkit = process.argv.includes("--webkit");
const extra = process.argv.slice(2).filter((a) => a !== "--webkit").join(" ");
const prueba = webkit ? "--project=captura-webkit" : "--grep @visual";
const r = spawnSync(
  "docker",
  [
    "run", "--rm", "--ipc=host", "-e", `VISUAL=${webkit ? "" : "1"}`, "-e", "CI=",
    "-v", `${process.cwd()}:/work`, "-v", "/work/node_modules", "-v", "/work/apps/pwa/node_modules", "-v", "/work/packages/capture/node_modules",
    "-w", "/work", "mcr.microsoft.com/playwright:v1.63.0-noble",
    "bash", "-c", `npm ci --no-audit --no-fund >/dev/null && npx playwright test ${prueba} --reporter=line ${extra}`,
  ],
  { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
);
process.exit(r.status ?? 1);
