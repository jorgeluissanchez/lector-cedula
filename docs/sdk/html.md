# HTML

Página estática con un módulo ES. El código es el mismo de [vanilla.md](vanilla.md); aquí solo el marcado mínimo:

```html
<video id="video" playsinline muted aria-label="Cámara"></video>
<button type="button" id="iniciar">Leer documento</button>
<p aria-live="polite" id="fase"></p>
<script type="module">
  import { crearLector } from "/vendor/lector-cedula/web/index.js";
  const lector = crearLector({ recursos: "/lector-cedula/", backend: "/api/cedula" });
  lector.suscribir((e) => (document.getElementById("fase").textContent = e.fase));
  document.getElementById("iniciar").addEventListener("click", () => lector.iniciar(document.getElementById("video")));
</script>
```

Sirve `@lector-cedula/web/dist` en `/vendor/lector-cedula/web/` y los assets en `/lector-cedula/`. Sin bundler, el import debe ser una ruta, no el nombre del paquete (o usa un import map). `playsinline` y `muted` son obligatorios en iOS.
