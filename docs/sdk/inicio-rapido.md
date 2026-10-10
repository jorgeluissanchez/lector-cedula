# Inicio rápido

Front React + back Express en el mismo origen, modo `front-back` con validación estricta.

## 1. Instalar

```sh
npm install @lector-cedula/web @lector-cedula/react @lector-cedula/servidor @lector-cedula/motor
```

## 2. Copiar los recursos del motor

El front carga Worker, WASM y modelos desde una URL tuya (`recursos`). Cópialos a la carpeta pública en cada build:

<!-- ejemplo: examples/copiar-recursos.mjs -->
```js
// Copia los assets de @lector-cedula/web (Worker, WASM, traineddata, DIVIPOL y manifest.json con SHA-256) a la carpeta
// pública del ejemplo, como haría un integrador (docs/sdk). Uso: node ../copiar-recursos.mjs <destino>
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const destino = process.argv[2];
if (destino === undefined) {
  console.error("uso: node copiar-recursos.mjs <destino>");
  process.exit(2);
}
const manifiesto = createRequire(import.meta.url).resolve("@lector-cedula/web/assets/manifest.json");
await cp(dirname(manifiesto), resolve(destino), { recursive: true });
```

```sh
node copiar-recursos.mjs public/lector-cedula
```

## 3. Back

<!-- ejemplo: examples/backend-express/servidor.mjs -->
```js
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
```

## 4. Front

<!-- ejemplo: examples/backend-express/src/main.tsx -->
```tsx
// Front React del ejemplo con backend propio (SDK-51): `backend: "/api/cedula"` del mismo origen y `autoIniciar`. El
// modo se puede elegir con `?modo=front|back|front-back`, `?validacion=estricta|auto` y `?streaming=0` (E2E de los modos, B.7).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useLectorCedula } from "@lector-cedula/react";

const RECURSOS = new URL("/lector-cedula/", location.href).href;
const parametros = new URLSearchParams(location.search);
const modo = (parametros.get("modo") ?? "front-back") as "front" | "back" | "front-back";
const validacion = parametros.get("validacion") as "estricta" | "auto" | null;
const streaming = parametros.get("streaming") !== "0";

function App() {
  const { videoRef, estado, reintentar } = useLectorCedula({
    recursos: RECURSOS,
    backend: "/api/cedula",
    modo,
    ...(modo === "front-back" && validacion ? { validacion } : {}),
    streaming,
    autoIniciar: true,
  });
  return (
    <main>
      <h1>Verifica tu identidad</h1>
      <video ref={videoRef} playsInline muted aria-label="Cámara" />
      <button type="button" data-prueba="reintentar" onClick={reintentar}>
        Otra vez
      </button>
      <ul aria-live="polite">
        <li>
          Estado: <b data-prueba="fase">{estado.fase}</b>
        </li>
        <li>
          NUIP: <output data-prueba="nuip">{estado.resultado?.campos.nuip ?? ""}</output>
        </li>
        <li>
          Confiable: <span data-prueba="confiable">{String(estado.resultado?.confiable ?? "")}</span>
        </li>
        <li>
          Error: <span data-prueba="error">{estado.error?.codigo ?? ""}</span>
        </li>
      </ul>
    </main>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

## 5. Probar

Abre la página por `https://` o `http://localhost` (la cámara lo exige), enfoca la cédula y espera `estado.fase === "resultado"` con `estado.resultado.confiable === true`. El back ya llamó a `alConfirmar`.

Antes de abrir la cámara en producción, obtén la autorización del titular (Ley 1581 de 2012).

Siguiente: [modos](README.md#modos), [protocolo](protocolo.md), [personalización](personalizacion.md).
