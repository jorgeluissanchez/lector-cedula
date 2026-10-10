// Librería Android del lector (sdk-nativo; design.md, decisiones 3 y 7 del orquestador): minSdk 24, ABIs arm64-v8a y
// x86_64, Kotlin integrado en AGP 9. La lógica sin Android vive en `:nucleo` (JVM puro), donde corren Kotest y PIT:
// gradle-pitest-plugin para Android (pl.droidsonroids) no es compatible con AGP 9.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.plugin.compose")
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

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests.all { it.useJUnitPlatform() }
    }
}

dependencies {
    api(project(":nucleo"))
    // NAT-05 (tarea 1.4): wrapper oficial de zxing-cpp, solo con el formato PDF417 (revisor-licencias, 2026-10-10).
    implementation("io.github.zxing-cpp:android:3.1.1")
    // NAT-02 y NAT-19 (tarea 1.7): CameraX (AOSP, Apache-2.0) en la versión de camera-core que ya trae zxing-cpp.
    implementation("androidx.camera:camera-camera2:1.5.2")
    implementation("androidx.camera:camera-lifecycle:1.5.2")
    api("androidx.camera:camera-view:1.5.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    // VistaCamara: Compose lo aporta la app del integrador (no viaja en el AAR ni en su árbol de dependencias).
    compileOnly("androidx.compose.runtime:runtime:1.12.1")
    compileOnly("androidx.compose.ui:ui:1.12.1")
    // KI de NAT-19: actividad con setContent y Espresso para inspeccionar la jerarquía (solo prueba).
    androidTestImplementation("androidx.activity:activity-compose:1.13.0")
    androidTestImplementation("androidx.compose.ui:ui:1.12.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    // KI: instrumentadas en el emulador (AndroidX Test, Apache-2.0; JUnit 4 transitiva, EPL-1.0, solo prueba).
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    // `:nucleo` la usa como `implementation`; las instrumentadas leen el JSON del bundle y del oráculo.
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
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
