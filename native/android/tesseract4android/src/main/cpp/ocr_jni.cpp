// JNI propio del OCR MRZ (sdk-nativo, NAT-06, tarea 1.5). Sustituye al JNI de Tesseract4Android: solo crea la API de
// Tesseract con el modelo en memoria (sin escribir en disco, NAT-13), reconoce píxeles RGBA (nunca archivos: Leptonica
// se compila sin libjpeg ni libpng) y la destruye. Mismos parámetros que la web (LMI-02): idioma, LSTM, lista blanca y
// segmentación. Sin logs. Las copias propias de los píxeles y del texto se ponen a cero antes de liberarse.
// Clase Kotlin: io.github.jorgeluissanchez.lectorcedula.mrz.TesseractNativo (métodos estáticos del companion).
#include <jni.h>

#include <tesseract/baseapi.h>

#include <algorithm>
#include <cstring>
#include <vector>

namespace {

struct CadenaJni {
  JNIEnv *env;
  jstring origen;
  const char *texto;
  CadenaJni(JNIEnv *e, jstring s) : env(e), origen(s), texto(s == nullptr ? nullptr : e->GetStringUTFChars(s, nullptr)) {}
  ~CadenaJni() {
    if (texto != nullptr) env->ReleaseStringUTFChars(origen, texto);
  }
};

}  // namespace

extern "C" JNIEXPORT jlong JNICALL Java_io_github_jorgeluissanchez_lectorcedula_mrz_TesseractNativo_nativoCrear(
    JNIEnv *env, jclass, jbyteArray modelo, jstring idioma, jstring listaBlanca, jstring segmentacion) {
  if (modelo == nullptr) return 0;
  const jsize n = env->GetArrayLength(modelo);
  if (n <= 0) return 0;
  std::vector<char> datos(static_cast<size_t>(n));
  env->GetByteArrayRegion(modelo, 0, n, reinterpret_cast<jbyte *>(datos.data()));
  CadenaJni lang(env, idioma);
  CadenaJni lista(env, listaBlanca);
  CadenaJni psm(env, segmentacion);
  if (lang.texto == nullptr || lista.texto == nullptr || psm.texto == nullptr) return 0;
  auto *api = new tesseract::TessBaseAPI();
  // Init en memoria: TessdataManager copia el modelo; `datos` puede liberarse al volver.
  const int r = api->Init(datos.data(), n, lang.texto, tesseract::OEM_LSTM_ONLY, nullptr, 0, nullptr, nullptr, false, nullptr);
  if (r != 0 || !api->SetVariable("tessedit_char_whitelist", lista.texto) || !api->SetVariable("tessedit_pageseg_mode", psm.texto)) {
    api->End();
    delete api;
    return 0;
  }
  // Sin salida de depuración (podría contener texto del documento).
  api->SetVariable("debug_file", "/dev/null");
  return reinterpret_cast<jlong>(api);
}

extern "C" JNIEXPORT jstring JNICALL Java_io_github_jorgeluissanchez_lectorcedula_mrz_TesseractNativo_nativoReconocer(
    JNIEnv *env, jclass, jlong puntero, jbyteArray rgba, jint ancho, jint alto) {
  auto *api = reinterpret_cast<tesseract::TessBaseAPI *>(puntero);
  if (api == nullptr || rgba == nullptr || ancho <= 0 || alto <= 0) return nullptr;
  const jsize n = env->GetArrayLength(rgba);
  if (static_cast<long long>(n) != static_cast<long long>(ancho) * alto * 4) return nullptr;
  std::vector<unsigned char> pixeles(static_cast<size_t>(n));
  env->GetByteArrayRegion(rgba, 0, n, reinterpret_cast<jbyte *>(pixeles.data()));
  // 4 bytes por píxel en orden R, G, B, A: Tesseract compone el Pix de 32 bpp de Leptonica con ese orden.
  api->SetImage(pixeles.data(), ancho, alto, 4, ancho * 4);
  std::fill(pixeles.begin(), pixeles.end(), 0);
  char *texto = api->GetUTF8Text();
  jstring r = nullptr;
  if (texto != nullptr) {
    r = env->NewStringUTF(texto);
    std::memset(texto, 0, std::strlen(texto));
    delete[] texto;
  }
  api->Clear();
  return r;
}

extern "C" JNIEXPORT void JNICALL Java_io_github_jorgeluissanchez_lectorcedula_mrz_TesseractNativo_nativoDestruir(JNIEnv *, jclass,
                                                                                                                jlong puntero) {
  auto *api = reinterpret_cast<tesseract::TessBaseAPI *>(puntero);
  if (api == nullptr) return;
  api->End();
  delete api;
}
