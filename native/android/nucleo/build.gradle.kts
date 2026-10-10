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
    testImplementation("io.kotest:kotest-runner-junit5:6.2.5")
    testImplementation("io.kotest:kotest-assertions-core:6.2.5")
    pitest("io.kotest:kotest-extensions-pitest:6.2.5")
}

tasks.test {
    useJUnitPlatform()
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
    // Fase 0: el núcleo aún no tiene lógica mutable (solo una constante); se quita en la tarea 1.2.
    failWhenNoMutations.set(false)
}
