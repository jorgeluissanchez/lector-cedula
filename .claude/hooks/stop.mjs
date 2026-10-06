// Stop: el agente principal no termina con pruebas en rojo o regresión en lo que ÉL tocó (principio II).
// Con agentes en paralelo, solo se comprueban las pruebas relacionadas con los archivos de su transcripción;
// la fase roja de TDD de otro agente no debe bloquearlo. El CI y `npm run check` cubren la suite completa.
import { archivosTocados, bloquear, cola, correr, leerEvento } from "./lib.mjs";

const evento = await leerEvento();
if (evento.stop_hook_active) process.exit(0); // evita bucles: solo se insiste una vez

const propios = archivosTocados(evento.transcript_path ?? "").filter((r) => /\.(m?[jt]sx?)$/.test(r));
if (propios.length === 0) process.exit(0);

const lista = propios.map((r) => `"${r}"`).join(" ");
const pruebas = correr(`npx vitest related --run --passWithNoTests ${lista}`);
if (!pruebas.ok) bloquear(`No termines todavía: hay pruebas en rojo relacionadas con tus cambios.\n${cola(pruebas.salida)}`);

if (propios.some((r) => /^(packages|evals)\//.test(r))) {
  const evals = correr("npm run --silent eval:quick");
  if (!evals.ok) bloquear(`No termines todavía: las evals rápidas muestran regresión.\n${cola(evals.salida)}`);
}
process.exit(0);
