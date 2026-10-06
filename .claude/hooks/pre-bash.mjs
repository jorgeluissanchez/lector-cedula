// PreToolUse (Bash|PowerShell): puertas antes de commits e instalaciones.
import { bloquear, cola, correr, leerEvento, paquetes } from "./lib.mjs";

const evento = await leerEvento();
const comando = String(evento.tool_input?.command ?? "");

// 1. Instalaciones npm: revisar licencia antes de instalar (principio IV).
const npm = paquetes(comando, /\bnpm\s+(?:i|install|add)\s+([^;&|\n]+)/);
if (npm.length > 0) {
  const r = correr(`node tools/licencia-check.mjs --package ${npm.join(" ")}`, { timeoutMs: 90_000 });
  if (!r.ok) bloquear(`Instalación bloqueada por licencia-check:\n${cola(r.salida)}`);
}

// 2. Instalaciones Python.
const pip = paquetes(comando, /\b(?:pip3?\s+install|uv\s+add|uv\s+pip\s+install)\s+([^;&|\n]+)/);
if (pip.length > 0) {
  const r = correr(`node tools/licencia-check.mjs --pip ${pip.join(" ")}`, { timeoutMs: 30_000 });
  if (!r.ok) bloquear(`Instalación bloqueada por licencia-check:\n${cola(r.salida)}`);
}

// 3. Commits: privacidad, licencias y tipos (principios II, III y IV).
if (/\bgit\b(?:\s+-c\s+\S+)*\s+commit\b/.test(comando)) {
  const puertas = [
    ["privacidad-check", "node tools/privacidad-check.mjs --staged"],
    ["licencia-check", "node tools/licencia-check.mjs"],
    ["typecheck", "npx tsc -b"],
  ];
  for (const [nombre, cmd] of puertas) {
    const r = correr(cmd);
    if (!r.ok) bloquear(`Commit bloqueado por ${nombre}:\n${cola(r.salida)}`);
  }
}
process.exit(0);
