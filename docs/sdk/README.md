# SDK del lector de cédula colombiana

Librería MIT para leer la cédula colombiana (PDF417 de la amarilla, MRZ de la digital, OCR) dentro de la aplicación de quien la integra. Tiene dos partes:

- **Front headless** (`@lector-cedula/web` y sus adaptadores `@lector-cedula/react`, `@lector-cedula/angular`, `@lector-cedula/vue`): abre la cámara, guía la captura, lee en el navegador si el modo lo pide y entrega **estado**, nunca UI. La interfaz es siempre de quien integra.
- **Back en el servidor de la empresa** (`@lector-cedula/servidor` con el motor `@lector-cedula/motor` en proceso): recibe la imagen, vuelve a leer, compara con lo que leyó el front, evalúa fraude y responde en vivo por NDJSON. Solo el back entrega un resultado **confiable**.

El motor (zxing, tesseract y fraude) corre en el servidor de la empresa que usa la librería, nunca en un servidor de los autores. No hay telemetría ni llamadas a terceros.

## Arquitectura: front + backend propio

```
Navegador (tu UI)                       Tu servidor (Node >= 20)
------------------------------------    -----------------------------------------------
useLectorCedula / crearLector     POST  crearLectorServidor({ alConfirmar })
  cámara + calidad + guía        -----> express() | nest() | next() | fastify() | manejar()
  lectura local (modo front-back) imagen   @lector-cedula/motor en worker_threads
  estado.fase / resultado        <----- NDJSON: recibido, leyendo, fraude, comparando, resultado
                                  stream  alConfirmar(documento) -> tu base de datos
```

1. El front captura una imagen buena (calidad y presencia del documento) y, según el modo, la lee localmente.
2. Envía la imagen (multipart `imagen` y, opcional, `cliente` con su lectura) a tu ruta, por ejemplo `/api/cedula`.
3. El back lee con el motor, compara (`compararConCliente`), evalúa fraude y emite eventos NDJSON; el último es siempre `resultado`.
4. Con `ok: true` llama a `alConfirmar(documento, contexto)`: ahí guardas el resultado en tu sistema. El front pasa a `resultado` con `confiable: true`.

Empieza por [inicio-rapido.md](inicio-rapido.md).

## Modos

| `modo` | Qué lee el front | Red | `confiable` |
|---|---|---|---|
| `"front"` (por omisión sin `backend`) | Todo, en el navegador | Ninguna | `false` |
| `"back"` | Nada: solo captura ligera, sin descargar el motor pesado | Envía la imagen | `true` tras el back |
| `"front-back"` (por omisión con `backend`) | Lee y muestra al instante; el back confirma | Envía imagen y lectura local | `true` tras el back |

Con `"front-back"`, `validacion` decide si el front lee siempre:

- `validacion: "estricta"` (por omisión): el front lee siempre y el back valida y compara.
- `validacion: "auto"`: `decidirFront(dispositivo, umbrales)` decide antes de abrir la cámara; en un dispositivo débil (memoria, núcleos, SIMD, ahorro de datos, red lenta) el front no lee y se comporta como `"back"`. Los umbrales por omisión están en `UMBRALES_FRONT` y se cambian con `umbralesAuto`. El estado expone `frontActivo` y `modoMotivo`.

`validacion` fuera de `"front-back"` o `modo: "back"` sin `backend` terminan en `error` con `codigo: "opcion-invalida"`.

Sin red en `front-back`, la imagen queda solo en memoria (`verificacion.etapa: "en-espera"`) y se envía al volver la conexión; vence con `tiempoColaMs` (`cola-vencida`).

## Streaming

`streaming: true` (por omisión) pide `Accept: application/x-ndjson` y el front recorre las etapas en `estado.verificacion` (`recibido`, `leyendo`, `fraude`, `comparando`). `streaming: false` pide `Accept: application/json` y recibe un único JSON igual al evento final. Detalle en [protocolo.md](protocolo.md).

## Elección de integración

- **Headless** (recomendado): tu UI sobre el estado. Guías: [react.md](react.md), [next.md](next.md), [angular.md](angular.md), [vue.md](vue.md), [vanilla.md](vanilla.md) (o [html.md](html.md)), [ionic.md](ionic.md), [react-native.md](react-native.md).
- **Componente** listo para usar `<lector-cedula>`: (planeado), paquete `@lector-cedula/elementos`.
- **Alojado**: página `/v/{token}` del modo microservicio, para apps nativas o sin JavaScript propio. Ver [modo-microservicio.md](modo-microservicio.md) y [nativo.md](nativo.md).

Backends: [backend-express.md](backend-express.md), [backend-nest.md](backend-nest.md), [backend-next.md](backend-next.md), [backend-fastify.md](backend-fastify.md), [backend-java.md](backend-java.md), [backend-go.md](backend-go.md). Personalización de la UI y la guía de encuadre: [personalizacion.md](personalizacion.md). Amenazas: [modelo-amenazas.md](modelo-amenazas.md).

## Garantías de privacidad

- Ninguna imagen se persiste: ni en el front (memoria, búferes a cero al terminar o al `destruir()`), ni en el back (el motor no usa disco ni red).
- Nada de biometría: no se devuelven bytes de foto, huella ni firma.
- Los eventos intermedios del protocolo nunca llevan datos del documento; `diferencias` solo trae rutas de campo, sin valores.
- La única caché es la del motor (`lector-cedula-sdk-<version>`), con recursos verificados por SHA-256.
- Menores y tarjeta de identidad no se envían salvo `enviarMenores: true`.
- Los registros del back no contienen cuerpo, imagen ni campos.

La empresa que integra es la Responsable del tratamiento (Ley 1581 de 2012): debe obtener la autorización previa, expresa e informada del titular antes de abrir la cámara. El SDK no la pide por ella.

## Modo opcional: microservicio

Si prefieres no exponer una ruta propia, el lector también funciona con un microservicio autoalojado: sesión creada desde tu backend con `crearCliente(...).crearSesion(...)`, `hosted_url` (página `/v/{token}`), `servidor` y `sesion` en el front, y resultado por webhook firmado (`verificarWebhook`, `webhookExpress`, `WebhookLectorModule`, `webhookNext`, `webhookFastify`). No es el camino por omisión. Guía completa: [modo-microservicio.md](modo-microservicio.md) y [express.md](express.md), [nest.md](nest.md), [fastify.md](fastify.md).

## Descargo de responsabilidad

Software MIT, sin garantía. Los autores no operan ninguna instancia ni tratan datos de terceros. Leer la cédula no prueba identidad por sí solo: no hay consulta a la Registraduría ni prueba de vida. Quien despliega responde por su uso, por la autorización de los titulares y por la política de tratamiento. Ver el [README raíz](../../README.md#descargo-de-responsabilidad) y [docs/legal](../legal/README.md).
