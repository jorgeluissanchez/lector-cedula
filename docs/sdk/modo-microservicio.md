# Modo opcional: microservicio

Alternativa al backend propio: un microservicio autoalojado (la API de validaciones de `server/`) que recibe la imagen, guarda la validación y avisa por webhook firmado. Útil para apps nativas (página alojada) o cuando no quieres el motor en tu proceso. No es el camino por omisión.

## Flujo

1. Tu backend obtiene la autorización del titular (Ley 1581 de 2012) y crea la sesión con la clave secreta, que nunca sale del servidor:

```ts
import { crearCliente } from "@lector-cedula/servidor";

const cliente = crearCliente({ servidor: "https://api.lector-cedula.example", clave: process.env.LECTOR_CLAVE as string });
const sesion = await cliente.crearSesion({
  autorizacion: { datos: true, sensibles: true, version_texto: "v1", otorgada_en: new Date().toISOString() },
  tipoDocumento: "cedula-ciudadania",
  urlRetorno: "https://app.tu-empresa.example/volver",
});
// sesion.id, sesion.urlAlojada (hosted_url, /v/{token}), sesion.expiraEn, sesion.sandbox
```

2. El usuario lee el documento por una de dos vías:
   - **Página alojada**: redirige a `sesion.urlAlojada`. `urlRetorno` debe estar en la lista de retornos permitidos de la clave.
   - **Tu front**: `crearLector({ recursos, servidor, sesion: token })`. `servidor` es `https:` (o `http://localhost`) y es excluyente con `backend`. El estado expone `envio` (`enviando`, `enviado` con `validacion_id`, `fallido` con `codigo`).
3. El microservicio envía un webhook firmado a tu backend. Verifícalo sobre los **bytes exactos** del cuerpo y, con el `validation_id`, pide el resultado de confianza con `cliente.obtenerResultado(id)`. Nunca decidas con lo que devuelve el navegador.
4. `cliente.suprimir(id)` borra la validación cuando ya no la necesites.

Errores de la API: `ErrorLector` con `estado`, `tipo` y `errores`.

## Webhooks firmados

Cabecera `X-Lector-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256 con tu secreto sobre `<t>.<cuerpo>`, tolerancia `TOLERANCIA_POR_DEFECTO` (300 s).

```ts
import { verificarWebhook } from "@lector-cedula/servidor";

const r = await verificarWebhook({ cuerpo: bytes, firma: cabecera, secreto: process.env.LECTOR_WEBHOOK as string });
if (r.valido) {
  // r.evento.data.validation_id, r.evento.data.status
} else {
  // r.motivo: firma-ausente | formato-invalido | firma-incorrecta | fuera-de-tolerancia | cuerpo-invalido
}
```

`verificarWebhook` nunca lanza. Adaptadores que responden 204, 400 o 500 sin cuerpo: `manejarWebhook` (`Request`/`Response`), [express.md](express.md) (`webhookExpress`), [nest.md](nest.md) (`WebhookLectorModule`), `webhookNext` y [fastify.md](fastify.md) (`webhookFastify`).

```ts
import { webhookNext } from "@lector-cedula/servidor/next";

export const POST = webhookNext({ secreto: process.env.LECTOR_WEBHOOK as string, alRecibir: async (evento) => { /* encola */ } });
```

Java y Go: [backend-java.md](backend-java.md#verificar-un-webhook-modo-microservicio), [backend-go.md](backend-go.md#verificar-un-webhook-modo-microservicio).
