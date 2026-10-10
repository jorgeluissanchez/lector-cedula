import java.math.BigDecimal

// Núcleo Kotlin sin Android (sdk-nativo): lógica pura probada en la JVM con Kotest (Apache-2.0) y mutación con PIT
// (Apache-2.0, gradle-pitest-plugin de szpak). `KJ` (`testDebugUnitTest`) también corre estas pruebas.
plugins {
    id("org.jetbrains.kotlin.jvm")
    id("info.solidsoft.pitest")
}

kotlin {
    jvmToolchain(21)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin.compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)

dependencies {
    // NAT-07 (tarea 1.1): motor QuickJS. El módulo KMP resuelve la variante JVM aquí y la Android en :lector-cedula.
    implementation("io.github.dokar3:quickjs-kt:1.0.15")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    testImplementation("io.kotest:kotest-runner-junit5:6.2.5")
    testImplementation("io.kotest:kotest-assertions-core:6.2.5")
    // NAT-01 "Secuencias arbitrarias": pruebas de propiedad de Kotest (decisión 3 del orquestador: sin jqwik).
    testImplementation("io.kotest:kotest-property:6.2.5")
    pitest("io.kotest:kotest-extensions-pitest:6.2.5")
}

// NAT-07: el bundle de packages/nucleo-js (npm run build -w @lector-cedula/nucleo-js) viaja como recurso; nunca se copia
// a mano al repositorio. Sin bundle construido, la compilación falla con un mensaje claro.
val bundleNucleo = rootProject.layout.projectDirectory.file("../../packages/nucleo-js/dist/nucleo.js")
val copiarBundle = tasks.register<Copy>("copiarBundleNucleo") {
    from(bundleNucleo) { into("lectorcedula") }
    into(layout.buildDirectory.dir("generated/bundle"))
    doFirst { check(bundleNucleo.asFile.isFile) { "Falta packages/nucleo-js/dist/nucleo.js: npm run build -w @lector-cedula/nucleo-js" } }
}
sourceSets.main { resources.srcDir(copiarBundle) }

// Tarea 1.3: oráculo TS de calidad (packages/capture en QuickJS) para el diferencial en proceso. Solo pruebas.
val oraculoCalidad = rootProject.layout.projectDirectory.file("../../packages/nucleo-js/dist/oraculo-calidad.js")
val copiarOraculo = tasks.register<Copy>("copiarOraculoCalidad") {
    from(oraculoCalidad) { into("lectorcedula") }
    into(layout.buildDirectory.dir("generated/oraculo"))
    doFirst { check(oraculoCalidad.asFile.isFile) { "Falta packages/nucleo-js/dist/oraculo-calidad.js: npm run nucleo:construir" } }
}
sourceSets.test { resources.srcDir(copiarOraculo) }

// Tarea 1.5 (NAT-06): oráculo MRZ (plan de vistas de packages/capture, sin OCR) para el diferencial en proceso.
val oraculoMrz = rootProject.layout.projectDirectory.file("../../packages/nucleo-js/dist/oraculo-mrz.js")
val copiarOraculoMrz = tasks.register<Copy>("copiarOraculoMrz") {
    from(oraculoMrz) { into("lectorcedula") }
    into(layout.buildDirectory.dir("generated/oraculo-mrz"))
    doFirst { check(oraculoMrz.asFile.isFile) { "Falta packages/nucleo-js/dist/oraculo-mrz.js: npm run nucleo:construir" } }
}
sourceSets.test { resources.srcDir(copiarOraculoMrz) }

// NAT-06 "Mismo modelo": mrz.traineddata (BSD-3-Clause) de `npm run modelos:mrz` viaja como recurso del núcleo (y del
// AAR) solo si su SHA-256 es el de `tesseract-mrz` en models/manifest.json. Nunca se copia a mano al repositorio.
val modeloMrz = rootProject.layout.projectDirectory.file("../../models/tesseract/mrz.traineddata")
val manifiestoModelos = rootProject.layout.projectDirectory.file("../../models/manifest.json")
val copiarModeloMrz = tasks.register<Copy>("copiarModeloMrz") {
    from(modeloMrz) { into("lectorcedula") }
    into(layout.buildDirectory.dir("generated/modelo"))
    inputs.file(manifiestoModelos)
    doFirst {
        check(modeloMrz.asFile.isFile) { "Falta models/tesseract/mrz.traineddata: npm run modelos:mrz" }
        @Suppress("UNCHECKED_CAST")
        val entradas = groovy.json.JsonSlurper().parse(manifiestoModelos.asFile) as List<Map<String, Any?>>
        val esperado = entradas.single { it["nombre"] == "tesseract-mrz" }["sha256"]
        val real = java.security.MessageDigest.getInstance("SHA-256").digest(modeloMrz.asFile.readBytes()).joinToString("") { "%02x".format(it) }
        check(real == esperado) { "mrz.traineddata no coincide con models/manifest.json ($real)" }
    }
}
sourceSets.main { resources.srcDir(copiarModeloMrz) }

// Tarea 1.5 (KJ con Tesseract real): la misma CMake de :tesseract4android compilada para el host Linux de la imagen
// docker/android-sdk (CMake 3.31.6 y Ninja del SDK, g++ del sistema). Fuera de Linux o sin CMake del SDK se omite y las
// pruebas con OCR real se saltan, salvo con `-PocrObligatorio=true` (CI), que las hace fallar.
val cmakeSdk = providers.environmentVariable("ANDROID_HOME").map { "$it/cmake/3.31.6/bin" }.orElse("")
val fuenteOcr = rootProject.layout.projectDirectory.dir("tesseract4android/src/main/cpp")
val dirOcrHost = layout.buildDirectory.dir("ocr-host")
val hilosOcr = (findProperty("ocrHilos") as String?) ?: "2"
fun ocrHostPosible(): Boolean = System.getProperty("os.name").startsWith("Linux") && File("${cmakeSdk.get()}/cmake").canExecute()
val configurarOcrHost = tasks.register<Exec>("configurarOcrHost") {
    onlyIf { ocrHostPosible() }
    inputs.dir(fuenteOcr)
    inputs.file(rootProject.layout.projectDirectory.file("tesseract4android/fuentes-nativas.json"))
    outputs.file(dirOcrHost.map { it.file("build.ninja") })
    doFirst {
        commandLine(
            "${cmakeSdk.get()}/cmake", "-S", fuenteOcr.asFile.absolutePath, "-B", dirOcrHost.get().asFile.absolutePath, "-G", "Ninja",
            "-DCMAKE_MAKE_PROGRAM=${cmakeSdk.get()}/ninja", "-DCMAKE_BUILD_TYPE=Release",
            "-DJNI_INCLUDE=${System.getProperty("java.home")}/include",
            "-DFUENTES_CACHE=${rootProject.layout.buildDirectory.dir("fuentes-nativas").get().asFile.absolutePath}",
        )
    }
}
val compilarOcrHost = tasks.register<Exec>("compilarOcrHost") {
    dependsOn(configurarOcrHost)
    onlyIf { ocrHostPosible() }
    inputs.dir(fuenteOcr)
    outputs.file(dirOcrHost.map { it.file("liblectorcedula_ocr.so") })
    doFirst { commandLine("${cmakeSdk.get()}/cmake", "--build", dirOcrHost.get().asFile.absolutePath, "--target", "lectorcedula_ocr", "-j", hilosOcr) }
}

tasks.test {
    dependsOn(compilarOcrHost)
    systemProperty("lectorcedula.ocr", dirOcrHost.get().file("liblectorcedula_ocr.so").asFile.absolutePath)
    systemProperty("nat.ocrObligatorio", (findProperty("ocrObligatorio") as String?) ?: "false")
    rootProject.layout.buildDirectory.dir("fixtures-mrz").get().asFile.let { systemProperty("lectorcedula.fixturesMrz", it.absolutePath) }
    useJUnitPlatform()
    maxHeapSize = "2g"
    // Carga de la máquina (CLAUDE.md): un solo proceso de pruebas.
    maxParallelForks = 1
}

tasks.register("testDebugUnitTest") {
    description = "Alias de test para que KJ (./gradlew testDebugUnitTest) incluya el núcleo JVM."
    dependsOn(tasks.test)
}

pitest {
    // `-PpitClases=a.*,b.*` acota la mutación (p. ej. por tarea); por omisión, todo el núcleo.
    targetClasses.set(((findProperty("pitClases") as String?)?.split(",") ?: listOf("io.github.jorgeluissanchez.lectorcedula.*")))
    // Sin esto el plugin toma `targetClasses` también como pruebas: acotar a `...mrz.*` dejaba PIT sin ninguna prueba.
    targetTests.set(listOf("io.github.jorgeluissanchez.lectorcedula.*"))
    testPlugin.set("Kotest")
    // Carga de la máquina (CLAUDE.md): un hilo (`-PpitHilos` para más) y la propiedad de NAT-01 con 100 casos por mutante (1000 en `KJ`).
    threads.set((findProperty("pitHilos") as String?)?.toInt() ?: 1)
    jvmArgs.set(listOf("-Xmx1536m", "-Dnat.iteraciones=100"))
    // Las pruebas con frames 1080p tardan segundos: sin margen, PIT marca TIMED_OUT mutantes que no cuelgan nada.
    timeoutConstInMillis.set(20_000)
    timeoutFactor.set(BigDecimal("2.0"))
    // `-PpitSinPruebas=*CalidadNat03Test,...` deja fuera pruebas que no cubren las clases mutadas por la tarea.
    (findProperty("pitSinPruebas") as String?)?.let { excludedTestClasses.set(it.split(",")) }
    // Código que genera el compilador de Kotlin y no escribe el proyecto: comprobaciones de nulos (Intrinsics), el
    // estado de las corrutinas (ResultKt) y los cuerpos de `runBlocking` e inline de quickjs-kt.
    avoidCallsTo.set(listOf("kotlin.jvm.internal", "kotlin.ResultKt"))
    excludedMethods.set(listOf("invokeSuspend"))
    // `-PpitExcluir=a.B*,...` resta clases a `pitClases` (fragmentos disjuntos del job `pit` de nativo-android).
    excludedClasses.set(listOf("*\$\$inlined\$*") + ((findProperty("pitExcluir") as String?)?.split(",") ?: emptyList()))
    outputFormats.set(listOf("HTML", "XML"))
    timestampedReports.set(false)
    // En los fragmentos de CI (`-PpitUmbral=0`) el umbral lo aplica tools/pit-resumen.mjs sobre la suma.
    mutationThreshold.set((findProperty("pitUmbral") as String?)?.toInt() ?: 85)
}
