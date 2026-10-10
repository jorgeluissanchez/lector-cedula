##
# Copyright (C) 2019 Adaptech s.r.o., Robert Pösel
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not
# use this file except in compliance with the License. You may obtain a copy of
# the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations under
# the License.
##
#
# Vendorizado de Tesseract4Android 4.9.0 (https://github.com/adaptech-cz/Tesseract4Android, etiqueta 4.9.0, commit
# 15c534717b1cb58261b58d4e4c1200c7f81f668c, tesseract4android/src/main/cpp/CMakeLists.txt) y MODIFICADO por
# lector-cedula (sdk-nativo, tarea 1.5; design.md, "Tesseract nativo sin libjpeg ni libpng"):
#   1. Sin add_subdirectory(libjpeg) ni add_subdirectory(libpng): IJG y libpng no están en la lista permitida. Las
#      vistas MRZ llegan como píxeles RGBA, nunca como archivo de imagen.
#   2. Las fuentes de Tesseract 5.5.1 y Leptonica 1.85.0 no se copian al repositorio: se descargan de su origen y se
#      verifica el SHA-256 de fuentes-nativas.json (son las mismas que copia Tesseract4Android 4.9.0).
#   3. Leptonica y Tesseract se compilan como bibliotecas estáticas y se enlazan en una sola biblioteca compartida,
#      lectorcedula_ocr, con un JNI propio (ocr_jni.cpp) en lugar del de Tesseract4Android.
#   4. El mismo proyecto compila para Android (NDK 28.2, CMake 3.31.6) y para el host Linux de las pruebas JVM (KJ).

cmake_minimum_required(VERSION 3.22)
project(LectorCedulaOcr C CXX)

# Tesseract requires newer C++ standard, so let's enable it for all libraries
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(FUENTES_JSON "${CMAKE_CURRENT_SOURCE_DIR}/../../../fuentes-nativas.json" CACHE FILEPATH "Fuentes fijadas")
set(FUENTES_CACHE "${CMAKE_BINARY_DIR}/fuentes-descargadas" CACHE PATH "Caché de los .tar.gz verificados")
set(FUENTES_DIR "${CMAKE_BINARY_DIR}/fuentes")

# Descarga (con caché compartida entre ABIs y bloqueo), verifica el SHA-256 y extrae en el directorio de compilación.
function(fuente_fijada nombre variable)
    file(READ "${FUENTES_JSON}" json)
    string(JSON n LENGTH "${json}" fuentes)
    math(EXPR ultimo "${n} - 1")
    foreach(i RANGE ${ultimo})
        string(JSON actual GET "${json}" fuentes ${i} nombre)
        if(actual STREQUAL nombre)
            string(JSON url GET "${json}" fuentes ${i} url)
            string(JSON sha GET "${json}" fuentes ${i} sha256)
            string(JSON dir GET "${json}" fuentes ${i} directorio)
        endif()
    endforeach()
    if(NOT DEFINED sha)
        message(FATAL_ERROR "fuentes-nativas.json: falta ${nombre}")
    endif()
    file(MAKE_DIRECTORY "${FUENTES_CACHE}")
    set(tarball "${FUENTES_CACHE}/${dir}.tar.gz")
    file(LOCK "${FUENTES_CACHE}/${nombre}.lock" GUARD FUNCTION TIMEOUT 600)
    if(EXISTS "${tarball}")
        file(SHA256 "${tarball}" actual_sha)
        if(NOT actual_sha STREQUAL sha)
            file(REMOVE "${tarball}")
        endif()
    endif()
    if(NOT EXISTS "${tarball}")
        file(DOWNLOAD "${url}" "${tarball}.part" EXPECTED_HASH SHA256=${sha} TLS_VERIFY ON STATUS estado)
        list(GET estado 0 codigo)
        if(NOT codigo EQUAL 0)
            file(REMOVE "${tarball}.part")
            message(FATAL_ERROR "No se pudo descargar ${url}: ${estado}")
        endif()
        file(RENAME "${tarball}.part" "${tarball}")
    endif()
    if(NOT EXISTS "${FUENTES_DIR}/${dir}/.verificado-${sha}")
        file(REMOVE_RECURSE "${FUENTES_DIR}/${dir}")
        file(ARCHIVE_EXTRACT INPUT "${tarball}" DESTINATION "${FUENTES_DIR}")
        file(WRITE "${FUENTES_DIR}/${dir}/.verificado-${sha}" "")
    endif()
    set(${variable} "${FUENTES_DIR}/${dir}" PARENT_SCOPE)
endfunction()

fuente_fijada(leptonica LEPTONICA_SRC)
fuente_fijada(tesseract TESSERACT_SRC)

# Adds the CMakeLists.txt file located in the specified directory as a build dependency.
add_subdirectory(leptonica)
add_subdirectory(tesseract)

add_library(lectorcedula_ocr SHARED ocr_jni.cpp)
target_link_libraries(lectorcedula_ocr PRIVATE tesseract leptonica)
if(NOT ANDROID)
    # Pruebas JVM en el host: cabeceras JNI del JDK que corre Gradle (JNI_INCLUDE la pasa la tarea compilarOcrHost).
    target_include_directories(lectorcedula_ocr PRIVATE "${JNI_INCLUDE}" "${JNI_INCLUDE}/linux")
endif()

# Control (tarea 1.5): ni libjpeg ni libpng pueden entrar en el binario.
foreach(prohibido jpeg pngx png png_static jpeg_static turbojpeg)
    if(TARGET ${prohibido})
        message(FATAL_ERROR "libjpeg/libpng no están permitidas (principio IV): objetivo ${prohibido}")
    endif()
endforeach()
