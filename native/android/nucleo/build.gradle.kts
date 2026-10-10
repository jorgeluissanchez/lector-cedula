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

tasks.test {
    useJUnitPlatform()
    maxHeapSize = "2g"
}

tasks.register("testDebugUnitTest") {
    description = "Alias de test para que KJ (./gradlew testDebugUnitTest) incluya el núcleo JVM."
    dependsOn(tasks.test)
}

pitest {
    targetClasses.set(listOf("io.github.jorgeluissanchez.lectorcedula.*"))
    testPlugin.set("Kotest")
    threads.set(2)
    outputFormats.set(listOf("HTML", "XML"))
    timestampedReports.set(false)
    mutationThreshold.set(85)
}
