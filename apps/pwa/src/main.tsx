import { render } from "preact";
import { App } from "./App";
import "./estilos.css";

const raiz = document.getElementById("app");
if (raiz) render(<App />, raiz);

// CAM-01: shell sin conexión. Solo en la compilación de producción (en desarrollo no existe sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
}
