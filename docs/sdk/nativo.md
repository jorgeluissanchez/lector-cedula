# Apps nativas: flujo alojado

Mientras el SDK nativo está (planeado), las apps nativas usan la página alojada `/v/{token}` del modo microservicio. Tu backend crea la sesión (`crearCliente(...).crearSesion({ autorizacion, tipoDocumento, urlRetorno })`) y entrega `sesion.urlAlojada` a la app. Nunca pongas la clave `sk_...` en la app.

- **Kotlin (Android)**: abre la URL con Custom Tabs (`CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(urlAlojada))`) y recibe el regreso por un App Link registrado como `urlRetorno`.
- **Swift (iOS)**: `ASWebAuthenticationSession(url:callbackURLScheme:completionHandler:)` o `SFSafariViewController`.
- **React Native**: `expo-web-browser` (`openAuthSessionAsync`) o `Linking.openURL`. Ver [react-native.md](react-native.md).
- **Flutter**: `flutter_custom_tabs` o `url_launcher` en modo navegador externo.

El regreso a la app solo indica que el usuario terminó: el resultado de confianza se obtiene en tu backend tras el webhook, con `obtenerResultado(id)`.
