# Backend Express

`crearLectorServidor(opciones)` de `@lector-cedula/servidor` crea el manejador del protocolo con el motor en proceso (`@lector-cedula/motor`, pool de `worker_threads`, sin red ni disco). `lector.express()` devuelve un manejador `(req, res)`.

```sh
npm install @lector-cedula/servidor @lector-cedula/motor express
```

<!-- ejemplo: examples/backend-express/servidor.mjs -->
```js
// Ejemplo de backend propio con Express (motor-backend-embebido, tarea 1.2; MOT-13 y SDK-51). El motor (zxing, tesseract
// y fraude) corre en este proceso, en el servidor de la empresa: nunca en un servidor del autor ni en otra red.
//
// Ley 1581 de 2012: antes de abrir la cámara, la empresa debe obtener y conservar la autorización previa, expresa e
// informada del titular para tratar sus datos (y la del representante si es menor). El front de este ejemplo muestra
// una casilla de plantilla; en producción la autorización la gestiona y conserva la empresa con su propio texto.
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
```

- Monta la ruta con `app.all` o `app.post` **antes** de `express.json()` u otro parser de cuerpo: el lector lee el cuerpo crudo.
- `alConfirmar(documento, contexto)` solo se llama con `ok: true`; `contexto` trae `riesgo`, `comparacion` y la `peticion`. Si lanza, el evento final es `error-interno`.
- Al apagar, `await lector.cerrar()` termina el pool.

## Opciones

| Opción | Por omisión | Qué hace |
|---|---|---|
| `alConfirmar` | (obligatoria) | Recibe el `DocumentoConfirmado` |
| `limites.bytes` | `BYTES_MAXIMOS` (10 MiB) | Rechazo `demasiado-grande` |
| `limites.tiempoMs` | `TIEMPO_MAXIMO_MS` (30 s) | Rechazo `tiempo-agotado` |
| `limites.documentos` | todos | Rechazo `documento-no-admitido` |
| `limites.admitirMenores` | `false` | Rechazo `menor-de-edad` |
| `fraude` | `true` | `false` lo desactiva; `{ bloquearSi: "medio" \| "alto" \| (riesgo) => boolean }` |
| `comparar` | `true` | Compara con la lectura del front (`CAMPOS_COMPARADOS`) |
| `motor` | motor compartido | Un `MotorLector` propio (pruebas o configuración) |

Si `@lector-cedula/motor` no está instalado, la primera petición falla con `ErrorServidor` (`MENSAJE_SIN_MOTOR`).

## Autenticación

El lector no autentica: protege la ruta con tu middleware (sesión, CSRF, límite de peticiones) antes de `lector.express()`. Desde el front, pasa cabeceras con `encabezadosBackend`.

## Privacidad

No registres el cuerpo, la imagen ni los campos. Guarda en `alConfirmar` solo lo que tu política de tratamiento permita y con su retención.
