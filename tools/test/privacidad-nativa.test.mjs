// NAT-13 (sdk-nativo, tarea 0.3): privacidad-check amplía sus reglas a Kotlin, Swift y al manifiesto de la librería
// Android. El núcleo nativo no persiste nada (SharedPreferences, UserDefaults, archivos, galería), no registra datos
// en logs y su manifiesto no declara INTERNET. Estas reglas no admiten la excepción `privacidad-ok`.
import { describe, expect, it } from "vitest";
import { revisarArchivo } from "../privacidad-check.mjs";

const KT = "native/android/lector-cedula/src/main/kotlin/io/github/jorgeluissanchez/lectorcedula/Almacen.kt";
const SWIFT = "native/ios/Sources/LectorCedula/Almacen.swift";

describe("NAT-13 Privacidad en fuentes nativas", () => {
  it.each([
    ['val p = contexto.getSharedPreferences("lector", 0)'],
    ["val p: SharedPreferences = x"],
    ['contexto.openFileOutput("frame.bin", 0)'],
    ["FileOutputStream(archivo).use { it.write(bytes) }"],
    ["bitmap.compress(Bitmap.CompressFormat.JPEG, 90, salida)"],
    ["File(contexto.cacheDir, \"x\").writeBytes(bytes)"],
    ["contexto.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, valores)"],
    ['Log.d("Lector", "nuip $nuip")'],
    ['println("campos $campos")'],
    ["val datos = dataStore.edit { }"],
  ])("NAT-13 Kotlin: %s es un hallazgo", (linea) => {
    expect(revisarArchivo(KT, `package x\n${linea}\n`)).not.toHaveLength(0);
  });

  it.each([
    ['UserDefaults.standard.set(nuip, forKey: "nuip")'],
    ["try datos.write(to: url)"],
    ["FileManager.default.createFile(atPath: ruta, contents: datos)"],
    ["UIImageWriteToSavedPhotosAlbum(imagen, nil, nil, nil)"],
    ["PHPhotoLibrary.shared().performChanges({})"],
    ['print("nuip \\(nuip)")'],
    ['NSLog("%@", campos)'],
    ['os_log("%{public}@", nombre)'],
  ])("NAT-13 Swift: %s es un hallazgo", (linea) => {
    expect(revisarArchivo(SWIFT, `import Foundation\n${linea}\n`)).not.toHaveLength(0);
  });

  it("NAT-13 la excepción privacidad-ok no aplica en el núcleo nativo", () => {
    expect(revisarArchivo(KT, 'val p = contexto.getSharedPreferences("x", 0) // privacidad-ok: no\n')).not.toHaveLength(0);
  });

  it("NAT-13 el código nativo sin persistencia ni logs pasa", () => {
    const kt = "package x\nclass Lector {\n  fun cancelar() { buffer.fill(0) }\n}\n";
    expect(revisarArchivo(KT, kt)).toStrictEqual([]);
    expect(revisarArchivo(SWIFT, "final class Lector {\n  func cancelar() { buffer.resetBytes(in: 0..<buffer.count) }\n}\n")).toStrictEqual([]);
  });

  it("NAT-13 las pruebas nativas pueden usar archivos temporales", () => {
    expect(revisarArchivo("native/android/lector-cedula/src/test/kotlin/x/VolcadoTest.kt", 'File("x").writeBytes(b)\nprintln("ok")\n')).toStrictEqual([]);
    expect(revisarArchivo("native/android/lector-cedula/src/androidTest/kotlin/x/SinArchivosTest.kt", "contexto.filesDir.walk()\n")).toStrictEqual([]);
    expect(revisarArchivo("native/ios/Tests/LectorCedulaTests/VolcadoTests.swift", "try d.write(to: u)\nprint(1)\n")).toStrictEqual([]);
  });
});

describe("NAT-13 Manifiesto de la librería Android", () => {
  const RUTA = "native/android/lector-cedula/src/main/AndroidManifest.xml";

  it("NAT-13 Manifiesto: declarar INTERNET es un hallazgo", () => {
    const xml = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n';
    const h = revisarArchivo(RUTA, xml);
    expect(h).toHaveLength(1);
    expect(h[0].mensaje).toContain("INTERNET");
  });

  it("NAT-13 Manifiesto: solo CAMERA pasa", () => {
    const xml = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <uses-permission android:name="android.permission.CAMERA" />\n</manifest>\n';
    expect(revisarArchivo(RUTA, xml)).toStrictEqual([]);
  });

  it("NAT-13 Manifiesto: el ejemplo del integrador puede declarar INTERNET", () => {
    const xml = '<uses-permission android:name="android.permission.INTERNET" />\n';
    expect(revisarArchivo("examples/android-compose/app/src/main/AndroidManifest.xml", xml)).toStrictEqual([]);
  });
});
