# Proposal: motor-backend-embebido

## Why

Decisión del usuario (2026-10-09): la lectura y la validación de la cédula deben poder correr DENTRO del backend del integrador, en el mismo proceso, sin desplegar el microservicio FastAPI aparte. Hoy el backend que quiere verificar lo que leyó el front solo tiene dos caminos: confiar en el resultado del cliente (`confiable: false`) o desplegar `server/`. Los servicios comerciales (Microblink BlinkID Verify, Regula Document Reader SDK) ofrecen SDK de servidor embebible; la meta propia es igualarlos de forma autoalojada, offline y MIT.

Las decisiones de diseño de este cambio las tomó el orquestador por delegación del usuario (memoria "decidir sin preguntar"); las irreversibles o externas quedan como preguntas abiertas en `design.md`.

## What Changes

- **Node (prioridad 1)**: paquete `@lector-cedula/motor` con `leerDocumento(buffer, opciones)` en el mismo proceso. Reutiliza `packages/capture` (zxing-wasm, tesseract.js con `mrz.traineddata` empaquetado y verificado por SHA-256, plan de giros, pista), `packages/parsers`, reglas de edad y tarjeta de identidad, otros documentos y `packages/fraud` (señal de riesgo). Trabajo pesado en `worker_threads` con pool configurable y límites (bytes, píxeles, tiempo, llamadas OCR). Sin red, sin disco, búferes a cero. Resultado idéntico a `npm run leer-foto -- --sin-mascara`. Función `compararConCliente` para que el backend contraste lo que envió el front. Ejemplos Express y Nest; compatible con route handlers de Next (`runtime = "nodejs"`).
- **Java (prioridad 2)** y **Go (prioridad 3)**: librerías nativas del lenguaje con la arquitectura de `sdk-nativo`: decodificación nativa (Java: ZXing core + Tess4J; Go: gozxing + gosseract) que solo entrega bytes PDF417 y líneas MRZ crudas, y reglas en el bundle `@lector-cedula/nucleo-js` (NAT-07) ejecutado en un motor JS embebido (Java: Rhino MPL-2.0 por omisión; Go: goja MIT). Prueba de contrato contra la CLI. Publicación Maven `io.github.jorgeluissanchez:lector-cedula-motor` y módulo Go `github.com/jorgeluissanchez/<repo>/motor/go` (publicación = tarea humana).
- **Plan B**: microservicio como sidecar en `127.0.0.1` (compose de ejemplo, sin puertos publicados al host público).
- **Front + back**: nueva opción `enviarA: { url }` en `@lector-cedula/web` para subir la imagen al backend propio del integrador con las reglas SDK-42, SDK-43 y SDK-44; el backend compara y decide; webhooks opcionales firmados con HMAC.

Fuera de alcance: selfie y face match; publicación real en npm, Maven Central o tag Go (requiere humano); Python embebido (ya existe `server/`); .NET, PHP y Ruby (cambio posterior); decodificar el QR de la digital (principio V).

## Capabilities

### New Capabilities
- `motor-backend-embebido`: motor de lectura embebible en Node, Java y Go, comparación con el cliente, sidecar de respaldo, opción `enviarA` del SDK web y webhooks, con privacidad, licencias, rendimiento y contrato con la CLI.

### Modified Capabilities
(ninguna como delta formal. SDK-38, SDK-42, SDK-43 y SDK-44 de `sdk-integracion` y NAT-07 de `sdk-nativo` se reutilizan por referencia sin alterar sus escenarios. `enviarA` se añade como requisito nuevo MOT-15 que remite a ellos.)

## Impact

- Código nuevo: `packages/motor`, `examples/backend-express`, `examples/backend-nest`, `examples/backend-next`, `motor/java/**`, `motor/go/**`, `examples/sidecar/compose.yaml`, `tools/motor/**`.
- Cambios: `packages/web/src/envio.ts` y `opciones` (MOT-15); `packages/capture` y `packages/fraud` solo si hace falta inyectar recursos sin `fetch` ni disco (sin cambiar resultados; lo prueba la eval).
- Dependencias nuevas (todas por `revisor-licencias` antes de instalarse): Rhino (MPL-2.0), ZXing core (Apache-2.0), Tess4J (Apache-2.0) y su dependencia JNA (LGPL-2.1 o Apache-2.0, elegir Apache-2.0), lept4j (Apache-2.0), gozxing (Apache-2.0), gosseract (MIT, requiere cgo y libtesseract), goja (MIT), Express (MIT), NestJS (MIT), JUnit 5 (EPL-2.0, solo prueba). GraalJS (UPL-1.0) queda como alternativa no adoptada: UPL no está en la lista del principio IV.
- Privacidad (`revisor-privacidad`): el motor recibe imágenes en el backend del integrador; MUST NOT escribirlas ni registrarlas.
- Rendimiento: p95 por lectura en servidor (MOT-11).

## Actualización: decisiones del usuario, 2026-10-09 (modelo backend propio)

La librería tiene dos partes, front headless y back; el motor (tesseract, zxing, fraude) corre en el servidor de la empresa que la usa, nunca en un servidor del autor. El modelo por defecto pasa a ser "front + backend propio con respuesta en vivo" (opción `backend`, `modo` front/back/front-back con `validacion` estricta/auto, fase `verificando`, protocolo NDJSON o JSON único en `@lector-cedula/protocolo`, `crearLectorServidor` en `@lector-cedula/servidor` y el motor pesado en `@lector-cedula/motor` como peerDependency opcional). Sesión, `hosted_url`, webhooks firmados y página alojada quedan como modo opcional microservicio, sin borrar lo implementado. Detalle en `design.md`, sección "Decisiones del usuario, 2026-10-09 (modelo backend propio)"; requisitos SDK-45 a SDK-60 y MOT-19 a MOT-25.
