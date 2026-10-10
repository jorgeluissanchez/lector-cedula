// Decisión del orquestador (design.md, cierre de preguntas, 1): el motor pesado va en `@lector-cedula/motor`, que
// `@lector-cedula/servidor` carga como peerDependency opcional. Sin motor instalado ni inyectado, crearLectorServidor
// falla al arrancar con un error claro. La importación es perezosa: el motor (WASM, modelo, workers) se crea en la
// primera petición, una sola vez.
import { createRequire } from "node:module";
import type { MotorLector } from "@lector-cedula/protocolo";

export const PAQUETE_MOTOR = "@lector-cedula/motor";
export const MENSAJE_SIN_MOTOR =
  "@lector-cedula/servidor necesita el motor: instala @lector-cedula/motor (npm install @lector-cedula/motor) o pasa `motor` en las opciones";

export class ErrorServidor extends Error {
  readonly codigo: "motor-no-instalado";
  constructor(codigo: "motor-no-instalado", mensaje: string) {
    super(mensaje);
    this.name = "ErrorServidor";
    this.codigo = codigo;
  }
}

export interface MotorPerezoso {
  obtener(): Promise<MotorLector>;
  cerrar(): Promise<void>;
}

type Resolver = (especificador: string) => string;
type Importar = (especificador: string) => Promise<{ crearMotor(): MotorLector }>;

const resolverPorDefecto: Resolver = (e) => createRequire(import.meta.url).resolve(e);
// Import en tiempo de ejecución que los empaquetadores (webpack, Turbopack, Vite) no deben resolver ni incluir: el motor
// usa worker_threads, WASM y archivos de su paquete (ejemplo Next, MOT-12).
const importarPorDefecto: Importar = (e) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ e) as Promise<{ crearMotor(): MotorLector }>;

export function cargarMotor(inyectado: MotorLector | undefined, resolver: Resolver = resolverPorDefecto, importar: Importar = importarPorDefecto): MotorPerezoso {
  if (inyectado) return { obtener: () => Promise.resolve(inyectado), cerrar: () => inyectado.cerrar() };
  try {
    resolver(PAQUETE_MOTOR);
  } catch {
    throw new ErrorServidor("motor-no-instalado", MENSAJE_SIN_MOTOR);
  }
  let creado: Promise<MotorLector> | null = null;
  return {
    obtener() {
      creado ??= importar(PAQUETE_MOTOR).then((m) => m.crearMotor());
      return creado;
    },
    async cerrar() {
      if (creado === null) return;
      const m = await creado.catch(() => null);
      await m?.cerrar();
    },
  };
}
