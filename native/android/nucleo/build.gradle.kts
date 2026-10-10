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

tasks.test {
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
