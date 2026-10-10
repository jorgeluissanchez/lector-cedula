# Ionic / Capacitor (WebView)

El front headless funciona dentro del WebView de Capacitor con cualquiera de los adaptadores ([react.md](react.md), [angular.md](angular.md), [vue.md](vue.md)). `getUserMedia` corre en el WebView; no hace falta un plugin de cámara.

## Permisos

- **Android** (`android/app/src/main/AndroidManifest.xml`): `<uses-permission android:name="android.permission.CAMERA" />`. Capacitor concede el permiso del WebView al de la app; si el usuario lo niega, el estado pasa a `error` con `codigo: "camara-denegada"`.
- **iOS** (`ios/App/App/Info.plist`): `NSCameraUsageDescription` con el motivo. iOS >= 14.3 permite `getUserMedia` en WKWebView.
- El `<video>` necesita `playsinline` y `muted`.

## Origen y recursos

El WebView sirve la app desde `https://localhost` (Android) o `capacitor://localhost` (iOS). Empaqueta los assets en `public/lector-cedula/` y pasa `recursos` relativo. Con un backend remoto, `backend` debe ser `https:` y tu servidor debe aceptar CORS del origen del WebView (`encabezadosBackend` para tu token de sesión).

```ts
import { useLectorCedula } from "@lector-cedula/react";

const { videoRef, estado } = useLectorCedula({ recursos: "/lector-cedula/", backend: "https://api.tu-empresa.example/cedula", encabezadosBackend: async () => ({ Authorization: "Bearer <token-de-tu-app>" }) });
```

## Sin red

Con `front-back`, la imagen queda en memoria hasta que vuelve la red (`verificacion.etapa: "en-espera"`). Registrar un service worker en Capacitor no es necesario: los assets van empaquetados.
