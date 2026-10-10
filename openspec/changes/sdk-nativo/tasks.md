# Tasks

Reglas: TDD (principio II), la prueba se ve fallar antes de implementar. Datos sintéticos (`PERSONA_BASE`, NUIP `9999123456`). Pruebas nombradas `NAT-xx <escenario>`. Comandos (`KJ`, `KI`, `KH`, `KM`, `KB`, `SX`, `SH`, `SB`, `CT`, `NJ`, `NM`, `RN`, `CP`, `TN`, `L`, `P`, `E`) y umbrales en `design.md`, `## Pruebas`. Cada tarea es un PR pequeño. Dependencias nuevas pasan por `revisor-licencias` antes de instalarse; tareas de cámara, envío o datos por `revisor-privacidad`. Pruebas que lanzan procesos declaran `{ timeout: 60_000 }`. Toda decisión que cambie comportamiento se traslada a `specs/` con su escenario.

## Fase 0. Motor de reglas y base de CI

- [ ] 0.1 Crear `packages/nucleo-js` (IIFE sin DOM, `procesarPdf417`, `procesarMrz`, `transicion`, `crearEstado`, `validarOpciones`) importando parsers, edad, máscara, `maquina.ts` y `estado.ts`; mover la validación de `upload.url` y la regla de menores a funciones puras reutilizadas por `packages/web`. Cubre NAT-07 (sin globals, errores pasados en Node), NAT-12 (lógica). Tipos: **unitaria**, **propiedad** (fast-check, numRuns >= 1000), **mutación**, **análisis estático**. Verificación: `NJ`, `NM`, `npx vitest run packages/web` sin regresión.
- [x] 0.2 `npm run check:tamano-nativo` con fixture de 409 601 B y registro de tamaños de artefactos. Cubre NAT-18. Tipos: **presupuesto de tamaño**, **unitaria**. Verificación: `TN`, `NJ`.
- [x] 0.3 `docker/android-sdk/Dockerfile` por digest (JDK 21, SDK 35, NDK y CMake fijados) y proyecto Gradle vacío `native/android` con JUnit 5 y PIT; `check:licencias` y `check:privacidad` amplían a Gradle, SwiftPM, Kotlin y Swift con fixtures GPL y `SharedPreferences` que fallan. Cubre NAT-16 (control), NAT-13 (estático). Tipos: **licencias**, **privacidad**, **unitaria** de las herramientas. Verificación: `KJ` (vacío en verde), `L`, `P`, `npx vitest run tools`. Revisor: `revisor-licencias`.
- [ ] 0.4 Workflows `.github/workflows/nativo-android.yml` (Docker + emulador con KVM, Actions fijadas por SHA) y `nativo-ios.yml` (`macos-15`), con un job trivial en verde y prueba estática de los workflows. Cubre NAT-17 (infraestructura). Tipos: **análisis estático**, **secretos** (gitleaks). Verificación: `NJ`, `npm run check`. **Requiere confirmación humana**: habilitar Actions y runners macOS.

## Fase 1. Núcleo Android (Kotlin)

- [x] 1.1 Motor JS en Kotlin: binding QuickJS elegido con `revisor-licencias`, carga del bundle desde `assets/`, igualdad con Node. Cubre NAT-07 (igualdad entre motores, errores pasados). Tipos: **unitaria**, **diferencial**. Verificación: `KJ`, `L`. Revisor: `revisor-licencias`.
- [x] 1.2 `Lector` con `StateFlow`, `FuenteFrames` inyectable y transiciones delegadas al bundle. Cubre NAT-01, NAT-11 (StateFlow). Tipos: **unitaria**, **propiedad** (Kotest property; decisión 3), **mutación**. Verificación: `KJ`, `KM`.
- [x] 1.3 Calidad y presencia en Kotlin con umbrales generados desde `umbrales.ts`; volcado JSON para el diferencial. Cubre NAT-03, NAT-04. Tipos: **unitaria**, **metamórfica**, **diferencial**, **mutación**. Verificación: `KJ`, `CT`, `KM`.
- [x] 1.4 PDF417 con zxing-cpp (solo `PDF417`), sin bytes en logs. Cubre NAT-05. Tipos: **unitaria**, **metamórfica**, **privacidad**, **diferencial** (bytes y luminancia frente a la web), **análisis estático**. Verificación: `KJ`, `KI` (el binario de zxing-cpp solo carga en Android; el diferencial de bytes con la web va en `KI` hasta que `CT` exista en la tarea 1.6; ver design.md, registro de la fase 1), `NJ`, `P`, `L`. Revisor: `revisor-licencias`.
- [ ] 1.5 MRZ con Tesseract nativo, localización, enderezado y plan de vistas; `mrz.traineddata` con el SHA-256 del manifiesto web. Cubre NAT-06. Tipos: **unitaria**, **diferencial**, **mutación**. Verificación: `KJ`, `CT`, `KM`. Revisor: `revisor-licencias`.
- [ ] 1.6 Contrato con la CLI (`npm run nativo:contrato`, con volcado alterado que falla) y `leerDocumento` sin cámara. Cubre NAT-08, NAT-11 (leerDocumento). Tipos: **contrato**, **evals**. Verificación: `CT`, `E`.
- [ ] 1.7 Cámara CameraX (resolución, enfoque continuo, linterna, liberación), `PreviewView` y composable `VistaCamara` sin decoración, copias a cero. Cubre NAT-02, NAT-13 (búferes), NAT-19 (Android). Tipos: **instrumentada**, **unitaria**. Verificación: `KI`, `KJ`. Revisor: `revisor-privacidad`.
- [ ] 1.8 Envío opcional (HTTP nativo; decisiones en el bundle) y manifiesto sin `INTERNET`. Cubre NAT-12, NAT-13 (manifiesto). Tipos: **unitaria**, **mutación**, **análisis estático**. Verificación: `KJ`, `KM`, `NJ`. Revisor: `revisor-privacidad`.
- [ ] 1.9 `examples/android-compose` (UI propia) y humo en emulador: tres documentos sin red, sin archivos nuevos, sin tráfico, jerarquía solo con la preview. Cubre NAT-17 (Android), NAT-13 (sin archivos, sin red), NAT-19 (UI distinta). Tipos: **humo en emulador** (Appium), **privacidad**. Verificación: `KH`, `KI`. Revisor: `revisor-privacidad`.
- [ ] 1.10 `apiDump`/`apiCheck`, `THIRD_PARTY_NOTICES` del AAR y benchmark de rendimiento. Cubre NAT-11 (API), NAT-16 (avisos), NAT-14 (Android). Tipos: **compatibilidad binaria**, **licencias**, **rendimiento**. Verificación: `KJ`, `L`, `KB` (en `REF`), `KI` (informe).

## Fase 2. Capacitor y React Native sobre Android

- [ ] 2.1 `packages/capacitor` (DependenciasLector nativas para `@lector-cedula/web`, rectángulo de la preview, delegación en web) y plugin Android con la preview detrás de la WebView transparente. Cubre NAT-09, NAT-19 (Capacitor). Tipos: **unitaria**, **tipos**, **mutación**. Verificación: `NJ`, `NM`.
- [ ] 2.2 `examples/ionic-nativo` (UI propia) y humo Capacitor en emulador (contexto nativo y `WEBVIEW_<pkg>`). Cubre NAT-09 (humo), NAT-19 (WebView encima, UI distinta). Tipos: **humo en emulador**. Verificación: `CP`. Revisor: `revisor-privacidad`.
- [ ] 2.3 `packages/react-native` (TurboModule, `useLectorCedula`, `VistaCamara` sin hijos) sin VisionCamera. Cubre NAT-10, NAT-19 (RN). Tipos: **unitaria** (`@testing-library/react-native`), **mutación**, **licencias**. Verificación: `NJ`, `NM`, `L`. Revisor: `revisor-licencias`.
- [ ] 2.4 `examples/react-native` (UI propia) y humo en emulador sin red. Cubre NAT-10 (humo), NAT-19 (UI distinta). Tipos: **humo en emulador**. Verificación: `RN`.

## Fase 3. iOS (Swift)

- [ ] 3.1 Motor JS con JavaScriptCore e igualdad con Node; `Lector` `ObservableObject` con `@Published` y `AsyncStream`; `FuenteFrames`. Cubre NAT-07 (JSC), NAT-01, NAT-11 (Swift). Tipos: **unitaria**, **diferencial**. Verificación: `SX`.
- [ ] 3.2 Calidad, presencia, PDF417 (zxing-cpp XCFramework) y MRZ (Tesseract XCFramework) con volcados para el diferencial. Cubre NAT-03, NAT-04, NAT-05, NAT-06. Tipos: **unitaria**, **diferencial**. Verificación: `SX`, `CT`. Revisor: `revisor-licencias`.
- [ ] 3.3 Cámara AVFoundation, `VistaCamaraUIView` solo con la capa de preview, copias a cero, envío. Cubre NAT-02, NAT-12, NAT-13 (búferes), NAT-19 (iOS). Tipos: **unitaria**. Verificación: `SX`. Revisor: `revisor-privacidad`.
- [ ] 3.4 `examples/ios-swiftui` (UI propia), humo en simulador con `FuenteFramesVideo`, plugin Capacitor y módulo RN para iOS. Cubre NAT-17 (iOS), NAT-09 y NAT-10 (iOS), NAT-19 (UI distinta). Tipos: **humo en simulador**. Verificación: `SH`, `SX`.
- [ ] 3.5 Rendimiento iOS en `REF` y avisos del paquete SwiftPM. Cubre NAT-14 (iOS), NAT-16. Tipos: **rendimiento**, **licencias**. Verificación: `SB`, `L`. **Requiere** dispositivo iOS físico.

## Fase 4. ML Kit opcional y cierre

- [ ] 4.1 Complementos `lector-cedula-mlkit` y `LectorCedulaMLKit` (solo PDF417, segundo intento, `warnings` `pdf417-mlkit`) y comprobación de que el núcleo no depende de ML Kit; nota en `docs/sdk/nativo.md`. Cubre NAT-15. Tipos: **unitaria**, **análisis de dependencias**. Verificación: `KJ`, `NJ`. Revisor: `revisor-licencias`, `revisor-privacidad`.
- [ ] 4.2 Cierre: `npm run check`, todos los comandos de `design.md` en verde, `eval:quick` sin regresión; `verificador` y `pr-test-analyzer` en paralelo; `revisor-producto` contra `benchmark-comercial` (Microblink, Regula, Scanbot: tiempo de lectura y calidad de cámara). Cubre todos. Verificación: todos los comandos.
