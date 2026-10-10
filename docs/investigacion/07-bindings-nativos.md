# 07. Bindings nativos: QuickJS y Tesseract para Android e iOS

Cambio `sdk-nativo`, decisión 2 del orquestador (2026-10-09): revisión de licencias previa a la tarea 1.1 (QuickJS) y a las tareas 1.5 y 3.2 (Tesseract). Este documento solo registra candidatos; **no se ha instalado ningún binario nativo**. Cada elección final pasa por `revisor-licencias` antes de entrar en `native/licencias-nativas.json`. Consultado el 2026-10-09 con `gh api repos/<repo>` (licencia SPDX que declara GitHub, archivado, último push) y la lectura del archivo de licencia o el README de cada proyecto.

Lista permitida (principio IV): MIT, Apache-2.0, BSD, ISC, MPL-2.0, CC0, CC BY, Zlib, Unlicense, BlueOak. Lo que no está en ella necesita decisión registrada.

## 1. Motor JS para Kotlin (Android y pruebas JVM)

El bundle `@lector-cedula/nucleo-js` ya se ejecuta en QuickJS en las pruebas de Node (`packages/nucleo-js/test/nat-07-quickjs.test.ts`, vía `quickjs-emscripten-core` 0.32.0 y `@jitl/quickjs-wasmfile-release-sync` 0.32.0, MIT, solo de desarrollo) con salida idéntica byte a byte a la de Node. Falta el binding Kotlin.

| Candidato | Licencia | Motor | Estado | Notas |
|---|---|---|---|---|
| [dokar3/quickjs-kt](https://github.com/dokar3/quickjs-kt) | Apache-2.0 | QuickJS (Bellard) | Activo (push 2026-10-08), 154 estrellas | Kotlin Multiplatform con destinos Android, **JVM** y Kotlin/Native: las pruebas JVM (`KJ`) pueden ejecutar el bundle en QuickJS sustituyendo el artefacto Android por el JVM, como documenta su README ("Android unit tests"). Maven Central `io.github.dokar3:quickjs-kt`. **Recomendado.** |
| [cashapp/zipline](https://github.com/cashapp/zipline) | Apache-2.0 | QuickJS | Muy activo (push 2026-10-09), 2307 estrellas | Pensado para cargar módulos Kotlin/JS con su propio protocolo y verificación de firmas; más pesado de lo necesario para llamar seis funciones JSON. Alternativa si quickjs-kt no se mantiene. |
| [HarlonWang/quickjs-wrapper](https://github.com/HarlonWang/quickjs-wrapper) | Apache-2.0 | QuickJS | Último push 2025-07-28 | Java/JNI, solo Android; sin destino JVM de escritorio. |
| [taoweiji/quickjs-android](https://github.com/taoweiji/quickjs-android) | Apache-2.0 | QuickJS | Sin cambios desde 2021-10-31 | Descartado por mantenimiento. |
| JNI propio sobre [quickjs-ng/quickjs](https://github.com/quickjs-ng/quickjs) | MIT | quickjs-ng | Activo (push 2026-10-08) | Plan B de la decisión 2 si ningún binding pasa: CMake del NDK fijado en `docker/android-sdk`. |

Motor: QuickJS de Bellard ([LICENSE](https://github.com/bellard/quickjs/blob/master/LICENSE), texto MIT; GitHub lo marca `NOASSERTION` porque el archivo no es el texto SPDX literal) y quickjs-ng (MIT). Ambos en la lista.

## 2. Motor JS para Swift (iOS)

`JavaScriptCore` del sistema (framework de Apple incluido en iOS): no se redistribuye ni añade binario, así que no entra en `THIRD_PARTY_NOTICES`. El workflow `nativo-ios.yml` comprueba en `macos-15` que el bundle corre en `jsc` sin globals de navegador.

## 3. Tesseract para Android

| Candidato | Licencia | Estado | Componentes que arrastra |
|---|---|---|---|
| [adaptech-cz/Tesseract4Android](https://github.com/adaptech-cz/Tesseract4Android) | Apache-2.0 | Activo (push 2026-02-05), 945 estrellas | Tesseract (Apache-2.0), Leptonica 1.85.0, libjpeg v9f, libpng 1.6.48. Se distribuye por JitPack (`cz.adaptech.tesseract4android:tesseract4android:4.9.0`), no por Maven Central. **Recomendado como base**, compilado desde su fuente en `docker/android-sdk` en vez de descargar el AAR de JitPack (reproducibilidad y cadena de suministro). |
| [rmtheis/tess-two](https://github.com/rmtheis/tess-two) | Apache-2.0 | **Archivado** (2022) | Descartado. |
| JNI propio sobre [tesseract-ocr/tesseract](https://github.com/tesseract-ocr/tesseract) | Apache-2.0 | Muy activo | Plan B: compilar Tesseract y Leptonica con el NDK y CMake fijados. |

## 4. Tesseract para iOS

| Candidato | Licencia | Estado | Notas |
|---|---|---|---|
| [SwiftyTesseract/SwiftyTesseract](https://github.com/SwiftyTesseract/SwiftyTesseract) | MIT | **Archivado** (2022) | Descartado. |
| [gali8/Tesseract-OCR-iOS](https://github.com/gali8/Tesseract-OCR-iOS) | MIT | Sin cambios desde 2021, Tesseract 3/4 antiguo | Descartado. |
| XCFramework propio de Tesseract + Leptonica (+ libpng/libjpeg o sin ellos) | Apache-2.0 + Leptonica | Construido en `macos-15` | **Recomendado** (design.md, decisión 7): se compila en CI con versiones fijadas y se publica solo como artefacto del run hasta que el usuario decida la distribución. |

## 5. Licencias que no están en la lista y necesitan `revisor-licencias`

| Componente | Licencia | Dónde aparece | Propuesta |
|---|---|---|---|
| Leptonica | [Licencia propia de Leptonica](https://github.com/DanBloomberg/leptonica/blob/master/leptonica-license.txt), texto BSD de 2 cláusulas (GitHub: `NOASSERTION`) | Tesseract en Android e iOS | Equivalente a BSD-2-Clause; registrar como tal tras la revisión y citar el texto en `THIRD_PARTY_NOTICES`. |
| libjpeg (IJG) v9f | Licencia IJG (permisiva, exige atribución en la documentación) | Tesseract4Android | No está en la lista. Evaluar compilar Leptonica sin libjpeg (las vistas MRZ llegan como píxeles en memoria, no como JPEG) para no necesitarla. |
| libpng 1.6.48 | Licencia libpng (libpng-2.0, permisiva) | Tesseract4Android | No está en la lista. Igual que libjpeg: Leptonica sin E/S de archivos de imagen la evita. |
| Android SDK, NDK, build-tools, CMake de Google | Android Software Development Kit License Agreement | `docker/android-sdk/Dockerfile` | **Solo herramienta de compilación**, no se redistribuye. La imagen exige `--build-arg ACEPTO_LICENCIA_ANDROID_SDK=si`: es una aceptación de términos que corresponde a una persona. |
| Eclipse Temurin 21 | GPL-2.0 con Classpath Exception | `docker/android-sdk/Dockerfile`, workflow `nativo-android.yml` | Solo herramienta de compilación (design.md, decisión 8). |
| JUnit Platform (transitiva de Kotest) | EPL-2.0 | Pruebas JVM | Solo pruebas, no se distribuye; registrada con justificación en `native/licencias-nativas.json` (decisión 3: no se declaran JUnit 5 ni jqwik). |

## 6. Siguientes pasos

1. `revisor-licencias` sobre las secciones 1, 3, 4 y 5.
2. Tarea 1.1: añadir quickjs-kt al registro y la igualdad JVM con Node sobre los mismos fixtures que `nat-07-quickjs.test.ts`.
3. Tareas 1.5 y 3.2: compilar Tesseract y Leptonica sin libjpeg ni libpng si la revisión no las admite.
