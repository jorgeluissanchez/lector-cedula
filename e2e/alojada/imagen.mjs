// Levanta `api-pruebas` para el E2E de la página alojada (sdk-integracion, SDK-14, tarea 4.1) con el código del
// directorio de trabajo: escribe el árbol con un índice temporal (`git write-tree`; nunca mueve HEAD, no crea commits
// ni toca el árbol ni el índice de nadie) y lo pasa como REF a la build (server/Dockerfile, etapa `fuente`).
// Proyecto de Compose y puerto propios para no chocar con otras suites que usan el puerto 8000.
// Uso: node e2e/alojada/imagen.mjs [--bajar]
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const PUERTO = Number(process.env.PUERTO_API_PRUEBAS ?? 8010);
const PROYECTO = "lector-alojado";
const repo = fileURLToPath(new URL("../..", import.meta.url));
const compose = ["compose", "-p", PROYECTO, "-f", join(repo, "server", "compose.yaml")];

function arbolDeTrabajo() {
  const dir = mkdtempSync(join(tmpdir(), "alojado-indice-"));
  const indice = join(dir, "index");
  try {
    copyFileSync(join(repo, ".git", "index"), indice);
    const env = { ...process.env, GIT_INDEX_FILE: indice };
    execFileSync("git", ["add", "-A", "--", "."], { cwd: repo, env, stdio: "ignore" });
    return execFileSync("git", ["write-tree"], { cwd: repo, env, encoding: "utf8" }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--bajar")) {
  execFileSync("docker", [...compose, "down"], { stdio: "inherit" });
} else {
  const ref = arbolDeTrabajo();
  const env = { ...process.env, REF_FUENTE: ref, PUERTO_API_PRUEBAS: String(PUERTO) };
  execFileSync("docker", [...compose, "build", "api-pruebas"], { stdio: "inherit", env });
  execFileSync("docker", [...compose, "up", "-d", "--wait", "api-pruebas"], { stdio: "inherit", env });
  process.stdout.write(`api-pruebas (${ref.slice(0, 12)}) en http://localhost:${PUERTO}\n`);
}
