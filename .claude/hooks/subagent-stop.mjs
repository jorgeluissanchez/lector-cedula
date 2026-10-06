// SubagentStop: un subagente no reporta éxito con pruebas en rojo o errores de tipos en lo que ÉL tocó.
// Lee su propia transcripción para no bloquearse por la fase roja de TDD de otro agente en paralelo.
import { archivosTocados, bloquear, cola, correr, leerEvento } from "./lib.mjs";

const evento = await leerEvento();
if (evento.stop_hook_active) process.exit(0);

const transcripcion = evento.agent_transcript_path ?? evento.transcript_path ?? "";
const propios = archivosTocados(transcripcion).filter((r) => /\.(m?[jt]sx?)$/.test(r));
if (propios.length === 0) process.exit(0);

const lista = propios.map((r) => `"${r}"`).join(" ");
const pruebas = correr(`npx vitest related --run --passWithNoTests ${lista}`);
if (!pruebas.ok) {
  bloquear(`El subagente dejó pruebas en rojo relacionadas con sus cambios. Corrígelas o reporta el bloqueo con la evidencia.\n${cola(pruebas.salida)}`);
}
if (propios.some((r) => /\.tsx?$/.test(r))) {
  const tipos = correr("npx tsc -b");
  if (!tipos.ok) bloquear(`El subagente dejó errores de tipos.\n${cola(tipos.salida)}`);
}
process.exit(0);
