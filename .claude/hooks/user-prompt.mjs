// UserPromptSubmit: inyecta el estado de las specs activas como contexto.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ } from "./lib.mjs";

function progreso(archivo) {
  if (!existsSync(archivo)) return "sin tasks.md";
  const t = readFileSync(archivo, "utf8");
  const hechas = (t.match(/- \[x\]/gi) ?? []).length;
  const total = hechas + (t.match(/- \[ \]/g) ?? []).length;
  return `${hechas}/${total} tareas`;
}

const lineas = [];
const cambios = join(RAIZ, "openspec", "changes");
if (existsSync(cambios)) {
  for (const c of readdirSync(cambios, { withFileTypes: true })) {
    if (c.isDirectory() && c.name !== "archive") lineas.push(`- OpenSpec ${c.name}: ${progreso(join(cambios, c.name, "tasks.md"))}`);
  }
}
const specs = join(RAIZ, "specs");
if (existsSync(specs)) {
  for (const s of readdirSync(specs, { withFileTypes: true })) {
    if (s.isDirectory()) lineas.push(`- Spec Kit ${s.name}: ${progreso(join(specs, s.name, "tasks.md"))}`);
  }
}
if (lineas.length > 0) {
  process.stdout.write(`Estado del harness (specs en curso):\n${lineas.join("\n")}\n`);
}
process.exit(0);
