# Modelo de amenazas del SDK

## Activos

- Datos del documento (NUIP, nombres, fechas, RH) y la imagen capturada.
- Clave secreta `sk_...` del modo microservicio y secreto de webhooks.
- Token de sesión de `hosted_url` y `upload.url`.
- Integridad del motor (Worker, WASM, modelos) servido al navegador.

## Fronteras de confianza

- Navegador del usuario (no confiable) frente al backend de la empresa (confiable).
- Backend de la empresa frente al microservicio (modo opcional), separados por firma HMAC.
- Recursos estáticos del motor frente a su manifiesto con SHA-256.

## Amenazas

- T1 manipulación en el cliente: el usuario altera el resultado en el navegador. Mitiga SDK-22, SDK-28, SDK-46 (solo el back emite `confiable: true`).
- T2 repetición de webhook: se reenvía un webhook capturado. Mitiga SDK-20, AV-26 (sello `t` con tolerancia de 300 s).
- T3 robo del token: se usa un token de sesión ajeno o vencido. Mitiga SDK-13, SDK-14 (token firmado y con vencimiento).
- T4 redirect abierto: `return_url` hacia un dominio del atacante. Mitiga SDK-13 (lista exacta de retornos).
- T5 clave en el navegador: la `sk_...` acaba en un bundle. Mitiga SDK-18, SDK-22 (cliente solo de servidor y búsqueda en bundles).
- T6 suplantación de origen: el front envía a un backend ajeno. Mitiga SDK-45, SDK-42 (backend del mismo origen, `https:` o localhost).
- T7 cámara inyectada: una cámara virtual o imagen reproducida. Mitiga SDK-39 (motor íntegro) y el análisis de fraude del back; la prueba de vida queda fuera del alcance, ver SDK-22.

## Mitigaciones

- Decidir solo en el backend (`alConfirmar` o `obtenerResultado`), nunca con datos del navegador.
- Verificar webhooks sobre los bytes crudos, en tiempo constante, y con tolerancia de tiempo.
- Mantener las claves fuera del front; la búsqueda de `sk_test_` y `sk_live_` corre en las pruebas.
- Servir el motor con su manifiesto SHA-256 y CSP restrictiva.
- No persistir imágenes ni registrar cuerpos; búferes a cero al terminar.
