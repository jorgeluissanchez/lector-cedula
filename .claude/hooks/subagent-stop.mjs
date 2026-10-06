// SubagentStop: un subagente no reporta éxito con pruebas en rojo.
import { bloquear, cambiosEn, cola, correr, leerEvento } from "./lib.mjs";

const evento = await leerEvento();
if (evento.stop_hook_active) process.exit(0);
if (!cambiosEn("packages", "apps", "tools", "evals")) process.exit(0);

const pruebas = correr("npx vitest run");
if (!pruebas.ok) {
  bloquear(`El subagente dejó pruebas en rojo. Corrígelas o reporta el bloqueo con la evidencia.\n${cola(pruebas.salida)}`);
}
const tipos = correr("npx tsc -b");
if (!tipos.ok) bloquear(`El subagente dejó errores de tipos.\n${cola(tipos.salida)}`);
process.exit(0);
