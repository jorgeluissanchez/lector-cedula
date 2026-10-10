plugins {
    id("com.android.library") version "9.4.1" apply false
    id("org.jetbrains.kotlin.jvm") version "2.4.10" apply false
    // NAT-19 (tarea 1.7): compilador de Compose para el composable VistaCamara (misma versión que Kotlin).
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10" apply false
    id("info.solidsoft.pitest") version "1.19.0" apply false
}
