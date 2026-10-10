# Backend propio: motor en tu servidor

El back del lector corre en el servidor de la empresa que integra la librería, nunca en un servidor de los autores. Recibe la imagen que envía el front, la vuelve a leer con el motor, la compara con la lectura del front, evalúa fraude y responde en vivo por NDJSON (o con un único JSON). Solo ese resultado es `confiable`.

## Node (recomendado)

`@lector-cedula/servidor` expone `crearLectorServidor({ alConfirmar, limites?, fraude?, comparar? })` con `manejar(Request)` y adaptadores `express()`, `nest()`, `next()` y `fastify()`. Carga `@lector-cedula/motor` (peerDependency opcional) en un pool de `worker_threads`, sin red ni disco. Requiere runtime Node (>= 20): en edge lanza `"@lector-cedula/servidor requiere runtime nodejs"`.

- Express: [backend-express.md](backend-express.md) y `examples/backend-express`.
- Next (route handler con `runtime = "nodejs"`): [backend-next.md](backend-next.md) y `examples/backend-next`.
- Nest: [backend-nest.md](backend-nest.md). Fastify: [backend-fastify.md](backend-fastify.md).

`alConfirmar(documento, contexto)` se llama una sola vez y solo con `ok: true`: es donde guardas el resultado. El fraude se calcula siempre y llega en `contexto.riesgo`; solo rechaza si configuras `fraude: { bloquearSi }`.

### Webhooks firmados (opcional)

`crearMotor({ webhook: { url, secreto } })` avisa tras cada lectura con `POST url` y cuerpo `{ evento: "lectura", tipo, riesgo_nivel, codigo? }`, sin campos personales. `url` debe ser `https` (o `http` de localhost). Es la única red que hace el motor y solo con esta opción; un fallo del webhook no cambia el resultado.

La entrega es de mejor esfuerzo: un único intento por lectura, sin reintentos, abortado a los 5 s y sin seguir redirecciones. Si tu receptor está caído, el aviso se pierde; el resultado autoritativo sigue siendo el de `alConfirmar` o el de `leerDocumento`.

**Firma.** Cada envío lleva `X-Lector-Signature: t=<unix>,v1=<hex>`, el mismo formato que el [modo microservicio](modo-microservicio.md): `v1` es el HMAC-SHA256 en hexadecimal minúscula, con tu `secreto`, de `<t>.<bytes exactos del cuerpo>`. Versiones anteriores enviaban `X-Lector-Firma: sha256=<hex>` solo sobre el cuerpo; ya no se envía porque no protegía contra repeticiones. Verifica antes de parsear, con el cuerpo crudo, y rechaza si `t` se aleja más de 300 s de tu reloj (`verificarFirmaWebhook` lo hace y compara en tiempo constante con `timingSafeEqual`):

```ts
import express from "express";
import { verificarFirmaWebhook } from "@lector-cedula/motor";

const app = express();
app.post("/webhooks/lector", express.raw({ type: "application/json" }), (req, res) => {
  const cabecera = req.get("x-lector-signature");
  if (!verificarFirmaWebhook(req.body, cabecera, process.env.LECTOR_WEBHOOK_SECRETO ?? "")) {
    res.status(400).end();
    return;
  }
  const aviso = JSON.parse(req.body.toString("utf8"));
  // aviso: { evento: "lectura", tipo, riesgo_nivel, codigo? }
  res.status(204).end();
});
```

En otros lenguajes: separa `t` y `v1` de la cabecera, calcula `HMAC-SHA256(secreto, t + "." + cuerpo)`, compáralo en tiempo constante con `v1` y comprueba `|ahora - t| <= 300`.

**Datos que viajan.** El cuerpo no lleva NUIP, nombres ni fechas, pero `tipo` y `codigo` pueden revelar que el titular es menor de edad (por ejemplo, `tipo` `tarjeta-identidad` o `codigo` `menor-de-edad`), y `riesgo_nivel` dice algo de esa persona dentro de tu flujo. Trátalo como dato personal. Si `url` apunta a un tercero (un proveedor de automatización, un CRM, otro servicio), ese tercero actúa como Encargado del tratamiento: necesitas un contrato de transmisión de datos con él (Ley 1581 de 2012 y Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015) antes de activar el webhook.

### Rendimiento

`npm run motor:bench` mide el arranque en frío y el p95 de 200 lecturas de la amarilla y la digital sintéticas con `hilos: 2`. Umbrales en la máquina de referencia (2 vCPU, 2 GiB): amarilla <= 1 500 ms, digital <= 2 500 ms, frío <= 4 000 ms.

## Java y Go

Mismo protocolo y mismas opciones: [backend-java.md](backend-java.md) y [backend-go.md](backend-go.md) (en desarrollo).

## Protocolo

Eventos `recibido`, `leyendo`, `fraude`, `comparando` y un evento final `resultado`; motivos de rechazo y esquema JSON en [protocolo.md](protocolo.md).

## Sidecar de respaldo (otros lenguajes)

Si tu backend no es Node, Java ni Go, `examples/sidecar/compose.yaml` ejecuta el microservicio de `server/` junto a tu backend en una red interna de compose: sin puertos publicados, raíz de solo lectura y `/tmp` en memoria sin ejecución. Tu servicio se une a la red `interna` y llama a `http://lector:8000`. Las claves llegan por variables de entorno, nunca en el archivo.

La red `interna` es `internal: true`: el contenedor del lector no tiene salida a Internet, así que sus webhooks (`webhook_url` de las sesiones del modo microservicio) no salen. Es intencional: en el sidecar tu backend consulta el resultado directamente (`GET /v1/validations/{id}`) y ningún dato sale de tu red. Si necesitas avisos, emítelos desde tu backend tras leer el resultado.

## Privacidad y Ley 1581 de 2012

- Ninguna imagen ni campo se escribe en disco ni en registros; los búferes se ponen a cero al terminar, rechazar o cancelar.
- Los eventos intermedios no llevan datos del documento; `diferencias` trae rutas de campo, sin valores.
- La empresa que integra es la Responsable del tratamiento: debe obtener la autorización previa, expresa e informada del titular (y la del representante si es menor) antes de abrir la cámara, y definir su política de retención de lo que guarda en `alConfirmar`.
