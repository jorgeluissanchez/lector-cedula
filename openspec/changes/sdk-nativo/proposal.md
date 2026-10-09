# Proposal: sdk-nativo

## Why

Decisión del usuario (2026-10-09): además del SDK web y de la WebView (`sdk-integracion`, tareas 7.1 y flujo alojado), el lector necesita un SDK móvil NATIVO para máxima velocidad y calidad de cámara. En WebView la cámara llega por `getUserMedia` (sin control fino de enfoque, sin linterna fiable en iOS, resolución limitada por el stream) y la decodificación corre en WASM. Los servicios comerciales de referencia (Microblink BlinkID, Regula, Scanbot) leen un PDF417 en menos de 0,5 s con cámara nativa; la meta propia es igualarlos de forma autoalojada, offline y MIT.

La decisión C de `sdk-integracion/design.md` dejó `@lector-cedula/react-native` como diseño sin tareas. Este cambio la reemplaza y la amplía.

## What Changes

- Núcleo nativo compartido por plataforma, sin UI:
  - Android (`native/android/lector-cedula-core`, Kotlin, CameraX): cámara de alta resolución con enfoque continuo y linterna, calidad (nitidez, luz, reflejo), presencia de documento, decodificación PDF417 con zxing-cpp (Apache-2.0, binding nativo) y MRZ TD1/TD3 con Tesseract nativo (Apache-2.0) y el mismo `mrz.traineddata` (BSD-3) con el plan de giros de `lectura-mrz-imagen`.
  - iOS (`native/ios/LectorCedulaCore`, Swift, AVFoundation): mismas capacidades.
- Reglas en un solo lugar: los parsers y validaciones TypeScript (`packages/parsers`, edad, DIVIPOL, máscara, máquina de estados) se empaquetan en un bundle JS sin DOM, `@lector-cedula/nucleo-js`, que corre en Hermes (React Native), en la WebView (Capacitor), en QuickJS embebido (Kotlin puro) y en JavaScriptCore del sistema (Swift puro). El código nativo solo entrega bytes crudos del PDF417 y líneas MRZ crudas; ningún número se decide en nativo.
- Paquetes de distribución:
  - `@lector-cedula/capacitor`: plugin Ionic/Capacitor con API headless igual a la web (`crearLector`, `EstadoLector`, mismas `TRANSICIONES`).
  - `@lector-cedula/react-native`: hook headless `useLectorCedula` y vista de cámara sin decoración `<VistaCamara lector={...} />` sobre un módulo propio (no VisionCamera).
  - Librerías nativas: Android en Maven (`co.lectorcedula:lector-cedula-android`) e iOS en SwiftPM (`LectorCedula`).
  - Complemento opcional `lector-cedula-mlkit` (Android) y `LectorCedulaMLKit` (iOS) para usar ML Kit como segundo intento de PDF417; nunca obligatorio y declarado (principio IV).
- Mismo contrato de estado que el núcleo web (fase, calidad, guía, contenido, progreso, intento, resultado con `confiable: false`, error, envío) y envío opcional al servidor con las reglas SDK-38, SDK-42, SDK-43 y SDK-44.
- Offline total y sin persistencia de imágenes.
- Orden: Android (núcleo Kotlin, luego Capacitor y React Native sobre Android) y después iOS.
- CI: compilación y pruebas JVM de Android en Docker (imagen con SDK de Android); emulador Android en GitHub Actions Linux con KVM; iOS en GitHub Actions macOS.

Fuera de alcance: Flutter, selfie y face match, antifraude nativo (`packages/fraud` sigue en la web; queda para un cambio posterior), publicación real en Maven Central, npm o el índice de SwiftPM (requiere confirmación humana), y cambios de formato de documento.

## Capabilities

### New Capabilities
- `sdk-nativo`: núcleo nativo de cámara, calidad y decodificación en Android e iOS, motor de reglas JS único, plugin Capacitor, hook React Native, librerías Maven y SwiftPM, paridad con el núcleo web y la CLI, rendimiento, privacidad y licencias.

### Modified Capabilities
(ninguna como delta formal. `sdk-integracion` decisión C queda sustituida por este cambio; sus requisitos SDK-27, SDK-28, SDK-38, SDK-41 a SDK-44 se reutilizan por referencia sin alterar sus escenarios.)

## Impact

- Código nuevo: `native/android/**`, `native/ios/**`, `packages/nucleo-js`, `packages/capacitor`, `packages/react-native`, `examples/react-native`, `examples/ionic-nativo`, `tools/nativo/**`, `.github/workflows/nativo-*.yml`, `docker/android-sdk/Dockerfile`.
- Sin cambios de comportamiento en `packages/parsers`, `packages/capture` ni `packages/web`; `packages/web/src/maquina.ts` y `estado.ts` se reexportan desde `nucleo-js` (mismo archivo fuente).
- Dependencias nuevas (todas pasan por `revisor-licencias` antes de instalarse): zxing-cpp (Apache-2.0), Tesseract y Leptonica (Apache-2.0 / BSD-2), binding de Tesseract para Android e iOS (licencia a verificar), QuickJS (MIT) y su binding Android (a verificar), CameraX (Apache-2.0), React Native (MIT), Capacitor (MIT), JUnit 5 (EPL-2.0, solo prueba: ver pregunta abierta), XCTest (sistema).
- Privacidad (`revisor-privacidad`): la cámara nativa maneja frames en memoria; el manifiesto de la librería no declara `INTERNET`.
- Recursos humanos: requiere una máquina o runner macOS para iOS y un dispositivo de gama media de referencia para las metas de rendimiento.
