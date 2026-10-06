// Utilidades compartidas por los hooks del harness.
import { spawnSync } from "node:child_process";
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

