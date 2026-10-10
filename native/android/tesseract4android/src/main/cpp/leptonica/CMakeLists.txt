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
# Vendorizado de Tesseract4Android 4.9.0 (tesseract4android/src/main/cpp/leptonica/CMakeLists.txt) y MODIFICADO por
# lector-cedula (tarea 1.5): sin libjpeg, libpng ni zlib (HAVE_LIBJPEG, HAVE_LIBPNG y HAVE_LIBZ a 0: Leptonica compila
# sus stubs jpegiostub.c, pngiostub.c y zlibmemstub.c), sin el JNI de Leptonica, biblioteca estática y fuentes
# descargadas y verificadas (LEPTONICA_SRC, del CMakeLists.txt raíz).

set(LEPT_PATH "${LEPTONICA_SRC}/src/")

configure_file(
        ${CMAKE_CURRENT_SOURCE_DIR}/endianness.h.in
        ${LEPT_PATH}endianness.h @ONLY)

file(GLOB leptonica_src "${LEPT_PATH}*.c")

add_library(leptonica STATIC ${leptonica_src})

target_include_directories(leptonica PUBLIC ${LEPT_PATH})

# Define preprocessor constants: ningún códec de imagen externo (las vistas llegan como píxeles).
target_compile_definitions(leptonica PRIVATE
        HAVE_LIBJPEG=0 HAVE_LIBPNG=0 HAVE_LIBTIFF=0 HAVE_LIBZ=0 HAVE_LIBGIF=0 HAVE_LIBUNGIF=0
        HAVE_LIBWEBP=0 HAVE_LIBWEBP_ANIM=0 HAVE_LIBJP2K=0)
if(ANDROID)
    target_compile_definitions(leptonica PRIVATE ANDROID_BUILD)
endif()

# Ignore some warnings during build
target_compile_options(leptonica PRIVATE "-Wno-address-of-packed-member")

if(NOT ANDROID)
    target_link_libraries(leptonica PUBLIC m)
endif()
