// Tesseract nativo del lector (sdk-nativo, NAT-06, tarea 1.5): módulo vendorizado de Tesseract4Android 4.9.0
// (Apache-2.0, https://github.com/adaptech-cz/Tesseract4Android/tree/4.9.0/tesseract4android) con parche. Solo la
// compilación nativa: `liblectorcedula_ocr.so` (Tesseract 5.5.1 + Leptonica 1.85.0 estáticas y el JNI de
// src/main/cpp/ocr_jni.cpp) para arm64-v8a y x86_64. La clase Kotlin que la usa (`mrz.TesseractNativo`) vive en
// `:nucleo`. Cambios frente a Tesseract4Android (design.md, "Tesseract nativo sin libjpeg ni libpng"): sin libjpeg ni
// libpng, sin el JNI ni las clases Java de Tesseract4Android, NDK 28.2.13676358 y CMake 3.31.6 (los de
// docker/android-sdk) en lugar de NDK 27.2 y CMake 3.22.1, y fuentes de Tesseract y Leptonica descargadas y
// verificadas por SHA-256 (fuentes-nativas.json).
plugins {
    id("com.android.library")
}

android {
    namespace = "io.github.jorgeluissanchez.lectorcedula.ocr"
    compileSdk = 35
    ndkVersion = "28.2.13676358"

    defaultConfig {
        minSdk = 24
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
        externalNativeBuild {
            cmake {
                targets += "lectorcedula_ocr"
                arguments += listOf(
                    "-DANDROID_STL=c++_static",
                    "-DFUENTES_CACHE=${rootProject.layout.buildDirectory.dir("fuentes-nativas").get().asFile.absolutePath}",
                )
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.31.6"
        }
    }

    buildTypes {
        debug {
            externalNativeBuild {
                cmake {
                    // Como Tesseract4Android: el código nativo siempre en Release (la variante debug es muy lenta).
                    arguments += "-DCMAKE_BUILD_TYPE=Release"
                }
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
