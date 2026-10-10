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
# Vendorizado de Tesseract4Android 4.9.0 (tesseract4android/src/main/cpp/tesseract/CMakeLists.txt) y MODIFICADO por
# lector-cedula (tarea 1.5): biblioteca estática, sin el JNI de Tesseract4Android (tessbaseapi.cpp, pageiterator.cpp,
# resultiterator.cpp), sin jnigraphics ni armeabi-v7a (ABIs arm64-v8a y x86_64, decisión 7) y fuentes descargadas y
# verificadas (TESSERACT_SRC, del CMakeLists.txt raíz). Mismas definiciones que Tesseract4Android: HAVE_CONFIG_H,
# GRAPHICS_DISABLED y FAST_FLOAT.

set(TESS_PATH "${TESSERACT_SRC}/src/")
set(TESS_INCLUDE_PATH "${TESSERACT_SRC}/include/")

# Get version with components from VERSION file.
file(STRINGS "${TESSERACT_SRC}/VERSION" VERSION_PLAIN)
string(REGEX REPLACE "^([^.]*)\\..*" "\\1" VERSION_MAJOR ${VERSION_PLAIN})
string(REGEX REPLACE "^[^.]*\\.([^.]*)\\..*" "\\1" VERSION_MINOR ${VERSION_PLAIN})
string(REGEX REPLACE "^[^.]*\\.[^.]*\\.([0-9]*).*" "\\1" VERSION_PATCH ${VERSION_PLAIN})
if(NOT PACKAGE_VERSION)
    set(PACKAGE_VERSION ${VERSION_PLAIN})
endif()

# Provide also same macro names as autoconf (see configure.ac).
set(GENERIC_MAJOR_VERSION ${VERSION_MAJOR})
set(GENERIC_MINOR_VERSION ${VERSION_MINOR})
set(GENERIC_MICRO_VERSION ${VERSION_PATCH})

configure_file(
        ${TESS_INCLUDE_PATH}tesseract/version.h.in
        ${TESS_INCLUDE_PATH}tesseract/version.h @ONLY)

configure_file(
        ${CMAKE_CURRENT_SOURCE_DIR}/config_auto.h.in
        ${TESS_PATH}api/config_auto.h @ONLY)

file(GLOB tesseract_src
        ${TESS_PATH}api/*.cpp
        ${TESS_PATH}ccmain/*.cpp
        ${TESS_PATH}ccstruct/*.cpp
        ${TESS_PATH}ccutil/*.cpp
        ${TESS_PATH}classify/*.cpp
        ${TESS_PATH}cutil/*.cpp
        ${TESS_PATH}dict/*.cpp
        ${TESS_PATH}lstm/*.cpp
        ${TESS_PATH}opencl/*.cpp
        ${TESS_PATH}textord/*.cpp
        ${TESS_PATH}viewer/*.cpp
        ${TESS_PATH}wordrec/*.cpp
        )

list(APPEND arch_files
        ${TESS_PATH}arch/dotproduct.cpp
        ${TESS_PATH}arch/simddetect.cpp
        ${TESS_PATH}arch/intsimdmatrix.cpp
        # NEON support (we can include these files on any architecture without explicit checks)
        ${TESS_PATH}arch/intsimdmatrixneon.cpp
        ${TESS_PATH}arch/dotproductneon.cpp
        )

add_library(tesseract STATIC ${tesseract_src} ${arch_files})

target_include_directories(tesseract PUBLIC ${TESS_INCLUDE_PATH})
target_include_directories(tesseract PRIVATE
        ${TESS_PATH}api
        ${TESS_PATH}arch
        ${TESS_PATH}ccmain
        ${TESS_PATH}ccstruct
        ${TESS_PATH}ccutil
        ${TESS_PATH}classify
        ${TESS_PATH}cutil
        ${TESS_PATH}dict
        ${TESS_PATH}lstm
        ${TESS_PATH}opencl
        ${TESS_PATH}textord
        ${TESS_PATH}viewer
        ${TESS_PATH}wordrec)

# Define preprocessor constants
target_compile_definitions(tesseract PRIVATE HAVE_CONFIG_H GRAPHICS_DISABLED FAST_FLOAT)

# Ignore some warnings during build
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    target_compile_options(tesseract PRIVATE "-Wno-null-dereference")
endif()

target_link_libraries(tesseract PUBLIC leptonica)
if(ANDROID)
    target_link_libraries(tesseract PUBLIC atomic dl log)
else()
    find_package(Threads REQUIRED)
    target_link_libraries(tesseract PUBLIC Threads::Threads dl)
endif()
