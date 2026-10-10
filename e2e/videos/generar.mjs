#!/usr/bin/env node
// Genera los seis vídeos sintéticos .y4m de la cámara simulada (design.md, decisión 11) con ffmpeg en Docker.
// No contienen ninguna cédula ni dato real: `testsrc2` con la luminancia acotada sobre un fondo gris, en la posición
// exacta de la guía de CAM-08. Salida en e2e/videos/sinteticos/ (ignorada por git). Uso: npm run e2e:videos
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, openSync, readSync, closeSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { leerCabeceraY4m } from "./y4m.mjs";
import { ESCENAS_CEDULA, fuentesCedula } from "./cedulas.mjs";
import { ESCENAS_FRAUDE, fuentesFraude } from "./fraude.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SALIDA = "e2e/videos/sinteticos";
const IMAGEN = "jrottenberg/ffmpeg:8-alpine";

const escena = (ancho, alto, x, y, anchoT, altoT, extra) =>
  `color=c=0x303030:s=${ancho}x${alto}:r=10[f];` +
  `testsrc2=s=${anchoT}x${altoT}:r=10,lutyuv=y='clip(val,40,200)'[t];` +
  `[f][t]overlay=${x}:${y}:shortest=1${extra ? `,${extra}` : ""}`;

const b1080 = (extra) => escena(1920, 1080, 190, 54, 1541, 972, extra);

export const ESCENAS = [
  { nombre: "desenfocada-1080p", grafo: b1080("gblur=sigma=8"), ancho: 1920, alto: 1080 },
  { nombre: "reflejo-1080p", grafo: b1080("drawbox=x=500:y=300:w=300:h=200:color=white:t=fill"), ancho: 1920, alto: 1080 },
  { nombre: "sobreexpuesta-1080p", grafo: b1080("lutyuv=y='clip(val*0.05+245,0,255)':u=128:v=128"), ancho: 1920, alto: 1080 },
  { nombre: "oscura-1080p", grafo: b1080("lutyuv=y='val*0.05':u=128:v=128"), ancho: 1920, alto: 1080 },
];

function cabecera(ruta) {
  const fd = openSync(ruta, "r");
  const buf = Buffer.alloc(256);
  readSync(fd, buf, 0, 256, 0);
  closeSync(fd);
  return leerCabeceraY4m(buf);
}

function docker(montajes, args) {
  execFileSync("docker", ["run", "--rm", ...montajes.flatMap((m) => ["-v", m]), "-w", "/w", IMAGEN, "-hide_banner", "-loglevel", "error", ...args], {
    stdio: "inherit",
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  });
}

function comprobar(e, destino) {
  const c = cabecera(join(RAIZ, destino));
  const ok = c.ancho === e.ancho && c.alto === e.alto && c.croma.startsWith("420");
  process.stdout.write(`${ok ? "OK " : "MAL"} ${e.nombre}: ${c.texto}\n`);
  return ok;
}

async function main() {
  mkdirSync(join(RAIZ, SALIDA), { recursive: true });
  let fallos = 0;
  for (const e of ESCENAS) {
    const destino = `${SALIDA}/${e.nombre}.y4m`;
    docker([`${RAIZ}:/w`], ["-f", "lavfi", "-i", e.grafo, "-frames:v", "10", "-pix_fmt", "yuv420p", "-y", destino]);
    if (!comprobar(e, destino)) fallos++;
  }
  // Cédulas sintéticas (pwa-lectura-offline, tarea 1.2): las PNG fuente van a un temporal fuera del repositorio.
  const fuentes = await fuentesCedula();
  const tmp = mkdtempSync(join(tmpdir(), "videos-cedula-"));
  try {
    writeFileSync(join(tmp, "amarilla.png"), fuentes.amarilla);
    writeFileSync(join(tmp, "digital.png"), fuentes.digital);
    writeFileSync(join(tmp, "pasaporte.png"), fuentes.pasaporte);
    writeFileSync(join(tmp, "ti-amarilla.png"), fuentes.tiAmarilla);
    writeFileSync(join(tmp, "sin-documento.png"), fuentes.sinDocumento);
    writeFileSync(join(tmp, "ilegible.png"), fuentes.ilegible);
    // deteccion-fraude (5.1b): reverso a color, pantalla y fotocopia.
    for (const [nombre, bytes] of Object.entries(await fuentesFraude())) writeFileSync(join(tmp, `${nombre}.png`), bytes);
    for (const e of [...ESCENAS_CEDULA, ...ESCENAS_FRAUDE]) {
      const destino = `${SALIDA}/${e.nombre}.y4m`;
      docker([`${RAIZ}:/w`, `${tmp}:/src:ro`], ["-loop", "1", "-i", `/src/${e.fuente}.png`, "-filter_complex", e.filtro, "-frames:v", "10", "-pix_fmt", "yuv420p", "-y", destino]);
      if (!comprobar(e, destino)) fallos++;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (fallos > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
