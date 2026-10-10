#!/usr/bin/env node
// Lee la cédula desde una foto local (cambios leer-pdf417-desde-imagen y leer-mrz-desde-imagen, LPI-06 y LPI-07):
// prueba primero el PDF417 de la amarilla y, si no lo hay, la MRZ TD1 del reverso de la digital.
// Una sola implementación (motor-backend-embebido, MOT-02): la lectura la hace @lector-cedula/motor en el hilo principal;
// la salida JSON de siempre es el formato de presentación de la CLI derivado del RESULTADO del motor, y
// `--sin-mascara --resultado` imprime el RESULTADO tal cual (lo compara `npm run motor:contrato`).
// Uso: npm run leer-foto -- [--sin-mascara [--resultado]] [--fecha-referencia AAAA-MM-DD] <ruta> | --licencias
// Licencias (divipol-consulados-2018, DC-10): el lugar de nacimiento usa datos del DANE y de la Registraduría bajo
// CC BY-SA 4.0; `--licencias` imprime la atribución completa (packages/parsers/THIRD_PARTY_NOTICES.md).
// Privacidad (principio III): la imagen solo se lee a memoria; no se escribe nada a disco, no hay telemetría y stdout
// solo lleva el JSON final. Por defecto enmascara NUIP y nombres. Rechaza rutas del repositorio salvo evals/real/.
import { readFileSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
// Máscara y lugar de nacimiento compartidos con la PWA (pwa-lectura-offline, OFF-08 y OFF-09).
import { enmascararCamposPdf417, enmascararNombre, enmascararResultadoMrz, enmascararUltimos2, MAX_LLAMADAS_OCR } from "../packages/capture/dist/index.js";
import { crearMotor } from "../packages/motor/dist/index.js";

const USO = "uso: npm run leer-foto -- [--sin-mascara [--resultado]] [--fecha-referencia AAAA-MM-DD] <ruta-de-la-foto> | --licencias";
/** Presupuesto de la CLI (LMI-13): 40 llamadas OCR; el tiempo lo acota el lector MRZ (60 s), no el motor. */
const OPCIONES_MOTOR = { hilos: 0, llamadasOcrMaximas: MAX_LLAMADAS_OCR, tiempoMaximoMs: 600_000 };
/** DC-10: atribución de los datos CC BY-SA 4.0 en toda salida PDF417 con ok: true. */
const FUENTES = "Datos: DANE y Registraduría, CC BY-SA 4.0; ver --licencias";
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Mensajes de error sin la ruta ni el contenido (LPI-06). */
function fallarUso(motivo) {
  process.stderr.write(`leer-foto: ${motivo}\n${USO}\n`);
  process.exitCode = 64;
}

function emitir(objeto, codigo) {
  process.stdout.write(`${JSON.stringify(objeto)}\n`);
  process.exitCode = codigo;
}

/** Fecha actual en America/Bogota como AAAA-MM-DD. */
function hoyEnBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Separa opciones y rutas; devuelve `{ error }` ante uso incorrecto. */
function leerArgumentos(argv) {
  const r = { conMascara: true, resultado: false, fechaReferencia: null, licencias: false, rutas: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sin-mascara") r.conMascara = false;
    else if (a === "--licencias") r.licencias = true;
    else if (a === "--resultado") r.resultado = true;
    else if (a === "--fecha-referencia") {
      const f = argv[++i];
      if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(f)) return { error: "fecha-referencia-invalida" };
      r.fechaReferencia = f;
    } else if (a.startsWith("--")) return { error: "opcion-desconocida" };
    else r.rutas.push(a);
  }
  if (r.licencias) return r;
  if (r.resultado && r.conMascara) return { error: "resultado-exige-sin-mascara" };
  if (r.rutas.length !== 1) return { error: r.rutas.length === 0 ? "falta-ruta" : "demasiadas-rutas" };
  return r;
}

/** Máscara de un documento ICAO que no es la cédula digital (CE o pasaporte), como `campos` en capture. */
function enmascararDocumento(d) {
  const c = d.campos;
  return { ...d, campos: { ...c, numeroDocumento: enmascararUltimos2(c.numeroDocumento), apellidos: enmascararNombre(c.apellidos), nombres: enmascararNombre(c.nombres) } };
}

/** Formato de presentación de la CLI (LPI-06, LPI-08, DC-10) derivado del RESULTADO del motor. */
function presentar(r, conMascara) {
  if (r.ok && r.tipo === "pdf417") {
    const resultado = conMascara ? { ...r.resultado, campos: enmascararCamposPdf417(r.resultado.campos) } : r.resultado;
    return [{ ok: true, tipo: "pdf417", intento: r.intento, enmascarado: conMascara, fuentes: FUENTES, resultado }, 0];
  }
  if (r.ok) {
    const crudo = r.resultado;
    const resultado = !conMascara ? crudo : "valido" in crudo ? enmascararResultadoMrz(crudo) : enmascararDocumento(crudo);
    return [{ ok: true, tipo: "mrz", intento: r.intento, enmascarado: conMascara, resultado }, 0];
  }
  const { codigo, tipo, digitosValidos } = r.error;
  if (codigo === "sin-lectura") return [{ ok: false, error: "documento-no-encontrado" }, 1];
  if (codigo === "imagen-ilegible") return [{ ok: false, error: "imagen-ilegible" }, 1];
  if (codigo === "mrz-no-valida") return [{ ok: false, tipo: "mrz", error: codigo, digitosValidos }, 2];
  return [{ ok: false, ...(tipo ? { tipo } : {}), error: codigo }, 2];
}

async function principal(argv) {
  const args = leerArgumentos(argv);
  if (args.error) return fallarUso(args.error);
  if (args.licencias) {
    process.stdout.write(readFileSync(join(RAIZ, "packages", "parsers", "THIRD_PARTY_NOTICES.md"), "utf8"));
    process.exitCode = 0;
    return;
  }
  const { conMascara, rutas } = args;

  let real;
  try {
    real = await realpath(rutas[0]);
  } catch {
    return fallarUso("archivo-ilegible");
  }
  const raiz = await realpath(RAIZ);
  const rel = relative(raiz, real);
  const dentro = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  const enEvalsReal = rel.startsWith(`evals${sep}real${sep}`);
  if (dentro && !enEvalsReal) return fallarUso("ruta-dentro-del-repo");

  let bytes;
  try {
    bytes = new Uint8Array(await readFile(real));
  } catch {
    return fallarUso("archivo-ilegible");
  }

  let motor;
  try {
    motor = await crearMotor(OPCIONES_MOTOR);
  } catch {
    bytes.fill(0);
    process.stderr.write("leer-foto: modelo MRZ no disponible; ejecuta npm run modelos:mrz\n");
    return emitir({ ok: false, tipo: "mrz", error: "modelo-no-disponible" }, 3);
  }
  let r;
  try {
    r = await motor.leerDocumento(bytes, { fechaReferencia: args.fechaReferencia ?? hoyEnBogota(), borrarEntrada: true });
  } catch (error) {
    if (error?.codigo === "opciones-invalidas") return fallarUso("fecha-referencia-invalida");
    if (error?.codigo === "formato-no-soportado") return emitir({ ok: false, error: "imagen-ilegible" }, 1);
    if (error?.codigo === "imagen-demasiado-grande") return emitir({ ok: false, error: "imagen-ilegible" }, 1);
    process.stderr.write("leer-foto: error interno del motor\n");
    return emitir({ ok: false, error: "error-interno" }, 1);
  } finally {
    bytes.fill(0);
    bytes = null;
    await motor.cerrar();
  }
  if (args.resultado) return emitir(r, r.ok ? 0 : 1);
  const [salida, codigo] = presentar(r, conMascara);
  return emitir(salida, codigo);
}

await principal(process.argv.slice(2));
