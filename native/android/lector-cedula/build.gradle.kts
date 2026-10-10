// Librería Android del lector (sdk-nativo; design.md, decisiones 3 y 7 del orquestador): minSdk 24, ABIs arm64-v8a y
// x86_64, Kotlin integrado en AGP 9. La lógica sin Android vive en `:nucleo` (JVM puro), donde corren Kotest y PIT:
// gradle-pitest-plugin para Android (pl.droidsonroids) no es compatible con AGP 9.
plugins {
    id("com.android.library")
}

android {
    namespace = "io.github.jorgeluissanchez.lectorcedula"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all { it.useJUnitPlatform() }
    }
}

dependencies {
    api(project(":nucleo"))
    // NAT-05 (tarea 1.4): wrapper oficial de zxing-cpp, solo con el formato PDF417 (revisor-licencias, 2026-10-10).
    implementation("io.github.zxing-cpp:android:3.1.1")
    // KI: instrumentadas en el emulador (AndroidX Test, Apache-2.0; JUnit 4 transitiva, EPL-1.0, solo prueba).
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    // `:nucleo` la usa como `implementation`; las instrumentadas leen el JSON del bundle y del oráculo.
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    // NAT-06 (tarea 1.5): liblectorcedula_ocr.so (Tesseract y Leptonica sin libjpeg ni libpng) para arm64-v8a y x86_64.
    implementation(project(":tesseract4android"))
}

// NAT-16: informe de lo que se distribuye en el AAR para check:licencias (`build/dependencias-resueltas.txt`).
tasks.register("informeDependencias") {
    val salida = layout.buildDirectory.file("dependencias-resueltas.txt")
    val componentes = configurations.named("releaseRuntimeClasspath").flatMap { it.incoming.resolutionResult.rootComponent }
    outputs.file(salida)
    doLast {
        val vistos = mutableSetOf<String>()
        fun recorrer(c: org.gradle.api.artifacts.result.ResolvedComponentResult) {
            for (d in c.dependencies) {
                if (d is org.gradle.api.artifacts.result.ResolvedDependencyResult) {
                    val m = d.selected.moduleVersion
                    if (m != null && m.group.isNotEmpty() && vistos.add("${m.group}:${m.name}:${m.version}")) recorrer(d.selected)
                    else if (m == null || m.group.isEmpty()) recorrer(d.selected)
                }
            }
        }
        recorrer(componentes.get())
        val lineas = vistos.filterNot { it.startsWith("lector-cedula-android:") }.sorted().map { "+--- $it" }
        salida.get().asFile.writeText((listOf("releaseRuntimeClasspath") + lineas).joinToString("\n", postfix = "\n"))
    }
}
