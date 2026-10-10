// Ejemplo de backend propio con NestJS (motor-backend-embebido, tarea 1.3; MOT-13 y SDK-51). El motor (zxing, tesseract
// y fraude) corre en este proceso, en el servidor de la empresa: nunca en un servidor del autor ni en otra red.
//
// Ley 1581 de 2012: antes de abrir la cámara, la empresa debe obtener y conservar la autorización previa, expresa e
// informada del titular para tratar sus datos (y la del representante si es menor). El front de este ejemplo muestra
// una casilla de plantilla; en producción la autorización la gestiona y conserva la empresa con su propio texto.
// Privacidad: no se registra el cuerpo, la imagen ni los campos; `alConfirmar` solo guarda en memoria el NUIP de la
// última confirmación para las pruebas. Una aplicación real lo guardaría en su propia base con su política de retención.
//
// `rawBody: true` es lo habitual en Nest (webhooks firmados): el parser JSON de Nest guarda `req.rawBody`, pero no toca
// multipart ni `image/*`, así que `lector.nest()` lee el flujo tal cual llega (Nest 12 trae express 5).
import "reflect-metadata";
import { fileURLToPath } from "node:url";
import { All, Controller, Inject, Module, Req, Res, type DynamicModule, type LogLevel, type OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { crearLectorServidor, type LectorServidor, type ManejadorNode, type MotorLector } from "@lector-cedula/servidor";

/** Token de inyección del lector (sin metadatos de tipos: el ejemplo no depende de `emitDecoratorMetadata`). */
export const LECTOR = Symbol("lector-cedula");

type PeticionNest = Parameters<ManejadorNode>[0];
type RespuestaNest = Parameters<ManejadorNode>[1];

@Controller("api")
class CedulaController {
  private readonly manejador: ManejadorNode;

  constructor(@Inject(LECTOR) lector: LectorServidor) {
    this.manejador = lector.nest();
  }

  /** `POST /api/cedula`: con `@Res()` Nest no serializa nada; el manejador escribe el NDJSON (o el JSON) en la respuesta. */
  @All("cedula")
  async cedula(@Req() peticion: PeticionNest, @Res() respuesta: RespuestaNest): Promise<void> {
    await this.manejador(peticion, respuesta);
  }
}

/** Registra el controlador con el lector y, al cerrar la app (`app.close()`), termina el pool del motor. */
@Module({})
class LectorModule implements OnApplicationShutdown {
  constructor(@Inject(LECTOR) private readonly lector: LectorServidor) {}

  async onApplicationShutdown(): Promise<void> {
    await this.lector.cerrar();
  }

  static registrar(lector: LectorServidor): DynamicModule {
    return { module: LectorModule, controllers: [CedulaController], providers: [{ provide: LECTOR, useValue: lector }] };
  }
}

export interface Confirmaciones {
  total: number;
  ultimoNuip: string | null;
}

export interface OpcionesApp {
  /** Motor inyectado (pruebas); sin él, `@lector-cedula/servidor` carga `@lector-cedula/motor` en proceso. */
  readonly motor?: MotorLector;
  /** Carpeta del front compilado (por omisión `dist/publico`). */
  readonly publico?: string;
  /** `false` silencia el registro de Nest (pruebas); por omisión solo errores y avisos, nunca cuerpos ni campos. */
  readonly registro?: false;
}

const PUBLICO = fileURLToPath(new URL("../publico", import.meta.url));
const NIVELES: LogLevel[] = ["error", "warn"];

/** Crea la app: `POST /api/cedula` con el lector y el front React compilado (mismo origen). */
export async function crearApp(opciones: OpcionesApp = {}): Promise<{ app: NestExpressApplication; lector: LectorServidor; confirmaciones: Confirmaciones }> {
  const confirmaciones: Confirmaciones = { total: 0, ultimoNuip: null };
  const lector = crearLectorServidor({
    ...(opciones.motor ? { motor: opciones.motor } : {}),
    alConfirmar(documento) {
      confirmaciones.total++;
      confirmaciones.ultimoNuip = (documento.campos as { nuip?: string }).nuip ?? null;
    },
  });
  const app = await NestFactory.create<NestExpressApplication>(LectorModule.registrar(lector), {
    rawBody: true,
    logger: opciones.registro === false ? false : NIVELES,
  });
  app.disable("x-powered-by");
  app.useStaticAssets(opciones.publico ?? PUBLICO);
  return { app, lector, confirmaciones };
}
