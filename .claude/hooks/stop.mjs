// Stop: el agente no termina si las evals rápidas empeoraron frente al baseline (principio II).
import { bloquear, cambiosEn, cola, correr, leerEvento } from "./lib.mjs";

const evento = await leerEvento();
if (evento.stop_hook_active) process.exit(0); // evita bucles: solo se insiste una vez
if (!cambiosEn("packages", "evals", "tools")) process.exit(0);

const pruebas = correr("npx vitest run");
if (!pruebas.ok) bloquear(`No termines todavía: hay pruebas en rojo.\n${cola(pruebas.salida)}`);

const evals = correr("npm run --silent eval:quick");
if (!evals.ok) bloquear(`No termines todavía: las evals rápidas muestran regresión.\n${cola(evals.salida)}`);
process.exit(0);
