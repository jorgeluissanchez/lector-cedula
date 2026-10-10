// Ayudas de las pruebas de crearLectorServidor (motor-backend-embebido, fase A): motor falso inyectable (pool falso),
// resultados sintéticos de PERSONA_BASE (NUIP 9999123456, PRUEBA EJEMPLO FICTICIA LUZ) y lectura del NDJSON.
import { expect } from "vitest";
import type { EventoProtocolo } from "@lector-cedula/protocolo";
import type { MotorLector, OpcionesLecturaMotor, ResultadoMotor } from "../../src/index.js";
import { ErrorMotor } from "../../src/index.js";

export const NUIP = "9999123456";

/** Bytes con firma PNG: el motor falso no los decodifica. */
export function imagenSintetica(tamano = 64): Uint8Array {
  const b = new Uint8Array(tamano);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < tamano; i++) b[i] = (i * 7) & 0xff;
  return b;
}

export const RIESGO_BAJO = {
  version: 1,
  puntaje: 4,
  nivel: "bajo",
  motivos: [],
  accion: "continuar",
  senalesOmitidas: [],
  fase: "heuristica",
  warnings: [],
} as const;

export const CAMPOS_AMARILLA = {
  numeroDocumento: NUIP,
  apellidos: "PRUEBA EJEMPLO",
  nombres: "FICTICIA LUZ",
  fechaNacimiento: "1990-05-17",
  sexo: "F",
  nacionalidad: "COL",
  paisEmisor: "COL",
  fechaVencimiento: null,
  nuip: NUIP,
  rh: "AB+",
  lugarNacimiento: null,
} as const;

export const AMARILLA: ResultadoMotor = {
  ok: true,
  tipo: "pdf417",
  intento: "original",
  resultado: {},
  tipoDocumento: "cedula-ciudadania",
  fuente: "pdf417",
  campos: CAMPOS_AMARILLA,
  warnings: [],
  confiable: false,
  riesgo: RIESGO_BAJO,
};

export const PASAPORTE: ResultadoMotor = {
  ...AMARILLA,
  tipo: "mrz",
  tipoDocumento: "pasaporte",
  fuente: "mrz-td3",
  campos: { ...CAMPOS_AMARILLA, rh: undefined, nuip: undefined, numeroDocumento: "PE0000001" },
};

export const SIN_DOCUMENTO: ResultadoMotor = { ok: false, error: { codigo: "sin-lectura" }, confiable: false, riesgo: null };
export const TI_MENOR: ResultadoMotor = { ok: false, error: { codigo: "menor-de-edad" }, confiable: false, riesgo: null };
export const AMARILLA_RIESGO_ALTO: ResultadoMotor = { ...AMARILLA, riesgo: { ...RIESGO_BAJO, puntaje: 90, nivel: "alto", accion: "bloquear" } };

/** Resultado del SDK web del mismo fixture (ResultadoPresentacion de @lector-cedula/web). */
export const CLIENTE = { tipo: "cedula-ciudadania", campos: CAMPOS_AMARILLA, warnings: [], confiable: false, validacion_id: null };

export interface MotorFalso extends MotorLector {
  llamadas: { imagen: Uint8Array; opciones: OpcionesLecturaMotor | undefined }[];
  senales: AbortSignal[];
  cerrado: boolean;
}

export interface ConfigMotorFalso {
  resultado?: ResultadoMotor;
  /** Milisegundos antes de resolver; se interrumpe con la señal. */
  demora?: number;
  error?: unknown;
  progresos?: readonly number[];
  /** No atiende la señal (para probar el límite de tiempo del manejador). */
  ignorarSenal?: boolean;
}

export function motorFalso(config: ConfigMotorFalso = {}): MotorFalso {
  const motor: MotorFalso = {
    llamadas: [],
    senales: [],
    cerrado: false,
    async leerDocumento(imagen, opciones) {
      motor.llamadas.push({ imagen, opciones });
      const senal = opciones?.senal;
      if (senal) motor.senales.push(senal);
      for (const p of config.progresos ?? []) opciones?.alProgreso?.(p);
      if (config.demora !== undefined) {
        await new Promise<void>((resolver, rechazar) => {
          const t = setTimeout(resolver, config.demora);
          if (senal && config.ignorarSenal !== true) {
            senal.addEventListener("abort", () => {
              clearTimeout(t);
              rechazar(new ErrorMotor("cancelado"));
            });
          }
        });
      }
      if (config.error !== undefined) throw config.error;
      return config.resultado ?? AMARILLA;
    },
    async cerrar() {
      motor.cerrado = true;
    },
  };
  return motor;
}

export function base64url(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64url");
}

export function multipart(imagen: Uint8Array | null, cliente?: unknown): FormData {
  const fd = new FormData();
  if (imagen) fd.set("imagen", new Blob([imagen], { type: "image/png" }), "foto.png");
  if (cliente !== undefined) fd.set("cliente", typeof cliente === "string" ? cliente : JSON.stringify(cliente));
  return fd;
}

export function peticion(cuerpo: BodyInit | null, init: RequestInit & { url?: string } = {}): Request {
  const { url = "http://localhost/api/cedula", ...resto } = init;
  return new Request(url, { method: "POST", body: cuerpo, ...resto });
}

export function lineas(texto: string): EventoProtocolo[] {
  expect(texto.endsWith("\n")).toBe(true);
  return texto
    .slice(0, -1)
    .split("\n")
    .map((l) => JSON.parse(l) as EventoProtocolo);
}

export async function eventos(respuesta: Response): Promise<EventoProtocolo[]> {
  return lineas(await respuesta.text());
}

export function etapas(evs: readonly EventoProtocolo[]): string[] {
  return evs.map((e) => e.etapa);
}

export function ultimo(evs: readonly EventoProtocolo[]): Record<string, unknown> {
  return evs.at(-1) as unknown as Record<string, unknown>;
}

