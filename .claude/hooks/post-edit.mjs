// PostToolUse (Edit|Write|MultiEdit): retroalimentación inmediata tras editar código.
import { readFileSync } from "node:fs";
import { revisarArchivo } from "../../tools/privacidad-check.mjs";
import { bloquear, cola, correr, leerEvento, rutaRelativa } from "./lib.mjs";

const evento = await leerEvento();
const ruta = evento.tool_input?.file_path;
if (!ruta) process.exit(0);
const rel = rutaRelativa(ruta);
if (rel.startsWith("..")) process.exit(0);

// 1. Privacidad sobre el archivo recién escrito (principio III).
let contenido = null;
try {
  contenido = readFileSync(ruta, "utf8");
} catch {
  /* binario o eliminado */
}
const hallazgos = revisarArchivo(rel, contenido);
if (hallazgos.length > 0) {
  bloquear(
    `privacidad-check bloqueó ${rel}:\n` +
      hallazgos.map((h) => `  - línea ${h.linea ?? "-"}: ${h.mensaje}`).join("\n") +
      "\nCorrige el código o justifica con `privacidad-ok: <razón>` en la línea.",
  );
}

// 2. Lint y pruebas relacionadas para TypeScript y herramientas JS.
if (/^(packages|apps)\/.+\.(ts|tsx)$|^tools\/.+\.mjs$/.test(rel)) {
  const lint = correr(`npx eslint --fix "${rel}"`);
  if (!lint.ok) bloquear(`eslint falló en ${rel}:\n${cola(lint.salida)}`);
  const pruebas = correr(`npx vitest related --run --passWithNoTests --maxWorkers=1 "${rel}"`);
  if (!pruebas.ok) {
    bloquear(`Pruebas relacionadas con ${rel} en rojo (principio II):\n${cola(pruebas.salida)}`);
  }
}
process.exit(0);
