// PreToolUse (Bash|PowerShell): puertas antes de commits e instalaciones.
import { evaluarNombre } from "../../tools/licencia-check.mjs";
import { instalaciones, nombreNpm, nombrePip } from "./instalaciones.mjs";
import { bloquear, cola, correr, correrNode, leerEvento, quitarHeredocs } from "./lib.mjs";

const evento = await leerEvento();
const comando = quitarHeredocs(String(evento.tool_input?.command ?? ""));
const { npm, pip, efimeros } = instalaciones(comando);

// 1. Instalaciones npm, pnpm, yarn y bun: revisar licencia en el registro antes de instalar (principio IV).
if (npm.length > 0) {
  const r = correrNode(["tools/licencia-check.mjs", "--package", ...npm], { timeoutMs: 90_000 });
  if (!r.ok) bloquear(`Instalación bloqueada por licencia-check:\n${cola(r.salida)}`);
}

// 2. Instalaciones Python (pip, python -m pip, uv, pipx, poetry, pdm).
if (pip.length > 0) {
  const r = correrNode(["tools/licencia-check.mjs", "--pip", ...pip.map(nombrePip)], { timeoutMs: 30_000 });
  if (!r.ok) bloquear(`Instalación bloqueada por licencia-check:\n${cola(r.salida)}`);
}

// 3. Ejecutores efímeros (npx, dlx, bunx, uvx, pipx run): no añaden dependencias, pero ejecutan el paquete.
//    Solo lista negra, sin red (ver la decisión en instalaciones.mjs).
const prohibidos = efimeros
  .map(({ tipo, nombre }) => evaluarNombre(tipo === "pip" ? nombrePip(nombre) : nombreNpm(nombre)))
  .filter((r) => !r.ok);
if (prohibidos.length > 0) {
  bloquear(`Ejecución bloqueada por licencia-check:\n${prohibidos.map((r) => `  - ${r.motivo}`).join("\n")}`);
}

// 4. Commits: privacidad, licencias y tipos (principios II, III y IV).
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
