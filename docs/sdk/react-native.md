# React Native

Hoy no hay módulo nativo publicado. Dos caminos:

1. **Página alojada** (modo microservicio): tu backend crea la sesión con `crearCliente(...).crearSesion(...)` y la app abre `sesion.urlAlojada` en el navegador del sistema (`expo-web-browser` o `Linking`), con `urlRetorno` hacia un deep link tuyo. El resultado llega a tu backend por webhook firmado. Ver [modo-microservicio.md](modo-microservicio.md) y [nativo.md](nativo.md).
2. **WebView propia** (`react-native-webview`) que cargue tu página con el front headless y `backend`. Habilita `mediaCapturePermissionGrantType="grant"` y los permisos de cámara de Android e iOS como en [ionic.md](ionic.md).

No uses el navegador embebido para la página alojada si necesitas que el usuario vea la URL: prefiere el navegador del sistema.

## Nativo (planeado)

SDK nativo para Android e iOS sobre el bundle `nucleo-js` (reglas compartidas en QuickJS), con un módulo de React Native encima: (planeado). Hasta entonces no hay API nativa; no importes nombres que no existen.
