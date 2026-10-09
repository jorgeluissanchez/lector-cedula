# Proposal: sdk-integracion

## Why

El usuario quiere usar el lector en varios aplicativos propios y de terceros (React, Angular, Vue, Next, Nest, Express y, a futuro, Kotlin, Swift, React Native y Flutter) sin que el integrador implemente nada del lector: ni captura, ni parsers, ni firma de webhooks. Hoy el lector solo existe como PWA (`apps/pwa`) y como API (`api-validaciones-contrato`, rutas `/v1/validations`). Integrarlo exige copiar código o conocer el contrato en detalle. Los servicios comerciales (Truora, Didit, Veriff, Microblink) ofrecen un componente web, un flujo alojado por enlace y SDK de backend; la meta es igualar esa experiencia, autoalojada y gratuita (MIT).

Decisiones tomadas por el orquestador por delegación del usuario (2026-10-08), fijadas aquí como contrato:

1. Motor único TypeScript/WASM (`packages/capture`, `packages/parsers` y futuros `fraud` y otros documentos) como núcleo de todos los frontales.
2. Frontal web (revisada por el usuario el 2026-10-08, ver `design.md`): núcleo HEADLESS `@lector-cedula/web` (`crearLector`, máquina de estados, sin UI ni estilos) más `leerDocumento()`; adaptadores finos `@lector-cedula/react` (también Next), `@lector-cedula/angular` y `@lector-cedula/vue`; el Web Component `<lector-cedula>` pasa a opcional en `@lector-cedula/elementos`. La PWA migra a consumir el mismo núcleo. Además (usuario, 2026-10-08) el frontal funciona 100 % offline y sin backend: `servidor` y `sesion` son opcionales y los assets del motor (WASM, Worker, traineddata, DIVIPOL, manifiesto SHA-256) viajan en `@lector-cedula/web/assets`; el servidor solo aporta el resultado firmado.
3. Flujo alojado universal: el backend del integrador crea una sesión y abre `https://<servidor>/v/<token>`; el resultado llega por webhook firmado y el usuario vuelve por redirect o deeplink. Sirve hoy en apps nativas sin SDK nativo.
4. Un solo servidor: el microservicio autoalojado (`server/`, Dokploy), multi-aplicativo por clave de API, con orígenes CORS y retornos por clave. El contrato OpenAPI es la fuente de verdad de clientes generados (TypeScript, Kotlin, Swift, Python) con openapi-generator (Apache-2.0) en CI. Paquete `@lector-cedula/servidor` sin dependencias de runtime, con adaptadores de una línea para Express, Nest, Next y Fastify.
5. Confianza: solo el resultado que el backend del integrador obtiene del microservicio (webhook firmado + consulta autenticada) es de confianza; el del frontal es de presentación.
6. Rendimiento: núcleo <= 30 KB gzip, cada adaptador <= 3 KB gzip, componente opcional <= 60 KB gzip; la lectura cumple OFF-15; precarga opcional del motor.
7. Semver, CHANGELOG, publicación npm con confirmación humana del token, documentación en `docs/sdk/`.

## What Changes

- Nuevo paquete `packages/web` (`@lector-cedula/web`): núcleo headless `crearLector` con estado observable (fase, calidad, guía, contenido, progreso, intento, resultado, error) sobre `packages/capture`, `leerDocumento()`, `precargarMotor()` y caché del motor. Sin DOM propio ni CSS.
- Nuevos adaptadores `packages/react`, `packages/angular`, `packages/vue` (framework como `peerDependency`, sin UI).
- `apps/pwa` pasa a consumir el núcleo (migración sin cambio de comportamiento).
- Nuevo paquete opcional `packages/elementos` (`@lector-cedula/elementos`): Custom Element `<lector-cedula>` con Shadow DOM, atributos `sesion`, `servidor`, `documentos`, `admitir-ti`, `idioma`, `tema`; eventos `resultado`, `error`, `cancelado`; carga diferida del motor desde la URL base `recursos`; caché offline; `precargarMotor()`; API headless `leerDocumento()`.
- Nuevo paquete `packages/servidor` (`@lector-cedula/servidor`): `crearCliente`, `crearSesion`, `obtenerResultado`, `verificarWebhook` (HMAC-SHA256 de AV-26) y adaptadores `express`, `nest`, `next`, `fastify` sobre `Request`/`Response` estándar.
- Servidor (`server/`): `return_url` y `hosted_url` en la creación de validaciones; página alojada `GET /v/{token}` (la PWA en modo sesión); configuración por clave (`origenes`, `retornos`, `secreto_webhook`); servicio estático de los recursos del motor bajo `/sdk/v1/`; rechazo de datos del documento enviados por el cliente.
- Clientes generados desde `server/openapi/api-validaciones.yaml` con openapi-generator en Docker, compilados en CI (no se publican en esta fase).
- Apps de ejemplo en `examples/` (HTML plano con el componente, vanilla headless, React, Angular, Vue, Next, Express, Nest, Fastify) y E2E en `e2e/sdk/`.
- `docs/sdk/`: guías por framework, flujo alojado para Kotlin, Swift, React Native y Flutter, modelo de amenazas.
- Versionado semver, `CHANGELOG.md` por paquete y flujo de publicación npm protegido por aprobación humana.

Fuera de alcance: SDK nativos (Kotlin, Swift; el hook `@lector-cedula/react-native` con VisionCamera queda solo como diseño) como paquetes propios (fase futura), publicación de los clientes generados en Maven, SwiftPM o PyPI, selfie y face match, y cambios de formato de documento.

## Capabilities

### New Capabilities
- `sdk-integracion`: componente web, API headless, flujo alojado por sesión, paquete de servidor Node, clientes generados, multi-aplicativo por clave, modelo de confianza, rendimiento, versionado y documentación para integrar el lector en cualquier aplicativo.

### Modified Capabilities
(ninguna como delta formal: `api-validaciones` sigue en el cambio activo `api-validaciones-contrato`; los añadidos al contrato de este cambio se especifican como requisitos nuevos SDK-xx que extienden AV-03, AV-07 y AV-25 sin alterar sus escenarios.)

## Impact

- Código: `packages/web`, `packages/react`, `packages/angular`, `packages/vue`, `packages/elementos`, `packages/servidor`, `examples/*`, `e2e/sdk/*`, `server/` (rutas `/v/{token}` y `/sdk/v1/*`, configuración por clave, `return_url`), `server/openapi/api-validaciones.yaml`, `apps/pwa` (modo sesión).
- Dependencias nuevas (sujetas a `revisor-licencias`): ninguna de runtime en `@lector-cedula/web` ni en `@lector-cedula/servidor` salvo los paquetes internos; dev: frameworks de ejemplo (React MIT, Angular MIT, Vue MIT, Next MIT, Express MIT, Nest MIT, Fastify MIT), openapi-generator-cli en Docker (Apache-2.0).
- Privacidad (`revisor-privacidad`): el flujo alojado envía imágenes al servidor; se procesan en memoria (AV-07) y nunca se persisten; las URL de retorno no llevan datos del documento.
- Despliegue: `server/compose.dokploy.yaml` añade `CLAVES_API_JSON` con la configuración extendida por clave; DP-08 no cambia de forma.

## Actualización: decisiones del usuario, 2026-10-09 (modelo backend propio)

La librería tiene dos partes, front headless y back; el motor (tesseract, zxing, fraude) corre en el servidor de la empresa que la usa, nunca en un servidor del autor. El modelo por defecto pasa a ser "front + backend propio con respuesta en vivo" (opción `backend`, `modo` front/back/front-back/auto, fase `verificando`, protocolo NDJSON o JSON único, `crearLectorServidor` en `@lector-cedula/servidor`, que absorbe `@lector-cedula/motor`). Sesión, `hosted_url`, webhooks firmados y página alojada quedan como modo opcional microservicio, sin borrar lo implementado. Detalle en `design.md`, sección "Decisiones del usuario, 2026-10-09 (modelo backend propio)"; requisitos SDK-45 a SDK-60 y MOT-19 a MOT-25.
