// Ejemplo de backend propio con Express (motor-backend-embebido, tarea 1.2; MOT-13 y SDK-51). El motor (zxing, tesseract
// y fraude) corre en este proceso, en el servidor de la empresa: nunca en un servidor del autor ni en otra red.
//
// Ley 1581 de 2012: antes de abrir la cámara, la empresa debe obtener y conservar la autorización previa, expresa e
// informada del titular para tratar sus datos (y la del representante si es menor). Este ejemplo no la pide por ella.
// Privacidad: no se registra el cuerpo, la imagen ni los campos; `alConfirmar` solo guarda en memoria el NUIP de la
// última confirmación para las pruebas. Una aplicación real lo guardaría en su propia base con su política de retención.
import { fileURLToPath } from "node:url";
import express from "express";
import { crearLectorServidor } from "@lector-cedula/servidor";

/** Crea la app: `POST /api/cedula` con el lector y el front React compilado (mismo origen). */
export function crearApp(opciones = {}) {
  const confirmaciones = { total: 0, ultimoNuip: null };
  const lector = crearLectorServidor({
    ...(opciones.motor ? { motor: opciones.motor } : {}),
    alConfirmar(documento) {
      confirmaciones.total++;
      confirmaciones.ultimoNuip = documento.campos.nuip ?? null;
    },
  });
  const app = express();
  app.disable("x-powered-by");
  app.all("/api/cedula", lector.express());
  app.use(express.static(fileURLToPath(new URL("./dist", import.meta.url))));
  return { app, lector, confirmaciones };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PORT ?? 4195);
  const { app } = crearApp();
  app.listen(puerto, "127.0.0.1", () => process.stdout.write(`ejemplo backend-express en http://127.0.0.1:${puerto}\n`));
}
