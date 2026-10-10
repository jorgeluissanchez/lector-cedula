// SDK nativo Android (sdk-nativo, tarea 0.3). Proyecto mínimo en verde: la librería `lector-cedula` (AAR) con pruebas
// JVM en Kotest y mutación con PIT. Las fuentes de dependencias están fijadas y sus licencias en
// native/licencias-nativas.json (check:licencias, NAT-16).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "lector-cedula-android"
include(":nucleo", ":lector-cedula")
