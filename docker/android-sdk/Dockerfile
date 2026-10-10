# Imagen de compilación del SDK nativo Android (sdk-nativo, tarea 0.3; design.md, decisión 8). Corre las pruebas JVM
# (`KJ`) y la mutación (`KM`) desde Windows sin Android Studio:
#   docker build --build-arg ACEPTO_LICENCIA_ANDROID_SDK=si -t lector-android-sdk docker/android-sdk
#   docker run --rm -v "$(pwd -W):/work" -w /work/native/android lector-android-sdk ./gradlew testDebugUnitTest
#
# Licencias (principio IV; docs/investigacion/07-bindings-nativos.md, "Herramientas de compilación"):
# - Eclipse Temurin 21 (GPL-2.0 con Classpath Exception): solo herramienta de compilación, no se redistribuye.
# - Android SDK command-line tools, platform 35, build-tools, NDK y CMake de Google: "Android Software Development Kit
#   License Agreement", fuera de la lista permitida. Solo herramienta de compilación: nada de la imagen se copia al AAR
#   salvo lo que el propio Gradle empaqueta del código del proyecto. Requiere revisor-licencias y aceptación humana de
#   esos términos: por eso la aceptación es un argumento explícito y la construcción falla sin él.
# - Gradle (Apache-2.0).
# Todo fijado: imagen base por digest, cmdline-tools y Gradle por SHA-256, paquetes del SDK por versión exacta.
FROM eclipse-temurin:21-jdk-noble@sha256:b468c3fc688b14450571494f588bd939378e7fd542ed5a73f8efc13f17872a87

ARG ACEPTO_LICENCIA_ANDROID_SDK=no
ARG CMDLINE_TOOLS=16111833
ARG CMDLINE_TOOLS_SHA256=0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8
ARG GRADLE=9.8.1
ARG GRADLE_SHA256=dce76f55f8e251a3a1f130eb120f30b3d271de2b76c9b0729d316b5a1b6dc01f
ARG PLATAFORMA=android-36
ARG BUILD_TOOLS=35.0.1
ARG NDK=28.2.13676358
ARG CMAKE=3.31.6

ENV ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_HOME=/opt/gradle \
    GRADLE_USER_HOME=/cache/gradle
ENV PATH=${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${GRADLE_HOME}/bin:${PATH}

RUN test "${ACEPTO_LICENCIA_ANDROID_SDK}" = "si" \
      || (echo "Construir esta imagen acepta la Android SDK License: pasa --build-arg ACEPTO_LICENCIA_ANDROID_SDK=si" && exit 1)

RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip g++ \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/clt.zip "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip" \
    && echo "${CMDLINE_TOOLS_SHA256}  /tmp/clt.zip" | sha256sum -c - \
    && mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && unzip -q /tmp/clt.zip -d "${ANDROID_HOME}/cmdline-tools" \
    && mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm /tmp/clt.zip

RUN curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE}-bin.zip" \
    && echo "${GRADLE_SHA256}  /tmp/gradle.zip" | sha256sum -c - \
    && unzip -q /tmp/gradle.zip -d /opt \
    && mv "/opt/gradle-${GRADLE}" "${GRADLE_HOME}" \
    && rm /tmp/gradle.zip

RUN yes | sdkmanager --licenses > /dev/null \
    && sdkmanager --install "platform-tools" "platforms;${PLATAFORMA}" "build-tools;${BUILD_TOOLS}" "ndk;${NDK}" "cmake;${CMAKE}" > /dev/null \
    && sdkmanager --list_installed

# Sin telemetría de Gradle ni demonio persistente en contenedores efímeros.
ENV GRADLE_OPTS="-Dorg.gradle.daemon=false -Dorg.gradle.welcome=never"
WORKDIR /work
