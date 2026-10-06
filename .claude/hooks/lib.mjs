// Utilidades compartidas por los hooks del harness.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export const RAIZ = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());

export async function leerEvento() {
  let datos = "";
  for await (const trozo of process.stdin) datos += trozo;
  try {
    return JSON.parse(datos || "{}");
  } catch {
    return {};
  }
}

/** Ejecuta un comando en la raíz del proyecto y devuelve {ok, salida}. */
export function correr(comando, { timeoutMs = 240_000 } = {}) {
  const r = spawnSync(comando, { cwd: RAIZ, shell: true, encoding: "utf8", timeout: timeoutMs });
  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0, salida };
}

/**
 * Elimina el cuerpo de los heredocs (<<EOF ... EOF, <<'EOF', <<-EOF) para que el texto que se escribe
 * a un archivo no se confunda con comandos (falsos positivos de "npm install" dentro de documentación).
 *
 * Seguridad (el hook no debe poder evadirse):
 * - La línea que abre el heredoc se conserva entera: lo que va después del delimitador se ejecuta.
 * - `<<<` es un here-string, no un heredoc: no oculta nada.
 * - Si el heredoc no se cierra, las líneas "tragadas" se devuelven, porque no hay garantía de que sean texto.
 */
export function quitarHeredocs(comando) {
  const lineas = String(comando).split("\n");
  const salida = [];
  let fin = null;
  let tragadas = [];
  for (const linea of lineas) {
    if (fin !== null) {
      if (linea.trim() === fin) {
        fin = null;
        tragadas = [];
      } else {
        tragadas.push(linea);
      }
      continue;
    }
    salida.push(linea);
    const m = /(?<!<)<<-?(?!<)\s*(["']?)([A-Za-z_][\w-]*)\1/.exec(linea);
    if (m) fin = m[2];
  }
  return [...salida, ...tragadas].join("\n");
}

const HERRAMIENTAS_EDICION = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const RUTA_EN_COMANDO = /(?:^|[\s"'=(])((?:packages|apps|tools|evals|server)\/[\w./@-]+\.(?:m?[jt]sx?|py))/g;

/**
 * Archivos del repositorio que un agente tocó, según su transcripción (JSONL): rutas de Edit/Write/
 * MultiEdit y rutas de código citadas en comandos de shell (ediciones hechas con scripts).
 * Con agentes en paralelo, los hooks de Stop deben comprobar solo lo propio, no la fase roja de otro.
 * Devuelve rutas relativas con "/", sin duplicados, en orden de aparición.
 */
export function archivosTocados(rutaTranscripcion, raiz = RAIZ) {
  let texto;
  try {
    texto = readFileSync(rutaTranscripcion, "utf8");
  } catch {
    return [];
  }
  const base = resolve(raiz);
  const vistos = new Set();
  const anadir = (ruta) => {
    const rel = relative(base, resolve(base, ruta)).split("\\").join("/");
    if (rel && !rel.startsWith("..") && !/^[a-zA-Z]:/.test(rel)) vistos.add(rel);
  };
  for (const linea of texto.split("\n")) {
    let entrada;
    try {
      entrada = JSON.parse(linea);
    } catch {
      continue;
    }
    const contenido = entrada?.message?.content;
    if (!Array.isArray(contenido)) continue;
    for (const parte of contenido) {
      if (parte?.type !== "tool_use") continue;
      if (HERRAMIENTAS_EDICION.has(parte.name) && typeof parte.input?.file_path === "string") {
        anadir(parte.input.file_path);
      } else if (typeof parte.input?.command === "string") {
        for (const m of parte.input.command.matchAll(RUTA_EN_COMANDO)) anadir(m[1]);
      }
    }
  }
  return [...vistos];
}

/** Ejecuta un script de Node con argumentos, sin pasar por la shell (evita que cmd.exe interprete nada). */
export function correrNode(args, { timeoutMs = 120_000 } = {}) {
  const r = spawnSync(process.execPath, args, { cwd: RAIZ, encoding: "utf8", timeout: timeoutMs });
  return { ok: r.status === 0, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export function rutaRelativa(ruta) {
  return relative(RAIZ, resolve(RAIZ, ruta)).split("\\").join("/");
}

/** Últimas n líneas, sin códigos de color, para no saturar el contexto del agente. */
export function cola(texto, n = 40) {
  return texto.replace(/\x1b\[[0-9;]*m/g, "").trim().split(/\r?\n/).slice(-n).join("\n");
}

/** Bloquea: el mensaje va a stderr y Claude lo recibe como retroalimentación. */
export function bloquear(mensaje) {
  process.stderr.write(`${mensaje}\n`);
  process.exit(2);
}

export function cambiosEn(...rutas) {
  const r = correr(`git status --porcelain -- ${rutas.join(" ")}`, { timeoutMs: 20_000 });
  return r.ok && r.salida.trim().length > 0;
}

/**
 * Extrae los nombres de paquete tras el subcomando de instalación.
 * Descarta flags, rutas locales y especificadores que no son del registro.
 */
export function paquetes(texto, regex) {
  const m = regex.exec(texto);
  if (!m) return [];
  return m[1]
    .split(/\s+/)
    .map((s) => s.replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0)
    .filter((s) => !s.startsWith("-"))
    .filter((s) => !/[<>&|;$`()]/.test(s)) // redirecciones y operadores de la shell, no paquetes
    .filter((s) => !/^(\.|\/|[a-z]:|file:|git\+|https?:)/i.test(s))
    .filter((s) => !s.includes("/") || /^@[\w.-]+\/[\w.-]+/.test(s));
}

