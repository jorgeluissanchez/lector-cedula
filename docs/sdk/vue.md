# Vue 3

`@lector-cedula/vue` expone `useLectorCedula(opciones, avanzado?)` con `{ videoRef, estado, iniciar, cancelar, reintentar }`. `estado` es un `shallowRef`. El controlador se crea en `onMounted` (nunca en SSR, también en Nuxt) y se destruye en `onBeforeUnmount`.

```sh
npm install @lector-cedula/web @lector-cedula/vue
```

## Componente

<!-- ejemplo: examples/vue/src/App.vue -->
```vue
<script setup lang="ts">
// Ejemplo Vue (SDK-12, SDK-33, SDK-37): UI propia sobre useLectorCedula, sin servidor.
import { computed, ref } from "vue";
import { precargarMotor } from "@lector-cedula/web";
import { useLectorCedula } from "@lector-cedula/vue";

const RECURSOS = new URL("/lector-cedula/", location.href).href;
const { videoRef, estado, iniciar, cancelar, reintentar } = useLectorCedula({ recursos: RECURSOS });
const motor = ref("");

const estiloGuia = computed(() => {
  const e = estado.value;
  const n = e.guia?.normalizada;
  if (n === undefined || (e.fase !== "activo" && e.fase !== "listo")) return { display: "none" };
  return { display: "block", left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: `${n.ancho * 100}%`, height: `${n.alto * 100}%` };
});

function precargar(): void {
  motor.value = "cargando";
  precargarMotor({ recursos: RECURSOS }).then(
    () => (motor.value = "listo"),
    (e: { codigo?: string }) => (motor.value = e.codigo ?? "error"),
  );
}
</script>

<template>
  <div class="tarjeta">
    <h1>Lectura de documento</h1>
    <div class="camara">
      <video ref="videoRef" playsinline muted></video>
      <div class="guia" data-prueba="guia" :style="estiloGuia"></div>
    </div>
    <div class="botones">
      <button type="button" data-prueba="iniciar" @click="iniciar()">Comenzar lectura</button>
      <button type="button" data-prueba="precargar" @click="precargar">Descargar motor</button>
      <button type="button" data-prueba="cancelar" @click="cancelar()">Parar</button>
      <button type="button" data-prueba="reintentar" @click="reintentar()">Repetir</button>
    </div>
    <table aria-live="polite">
      <tbody>
        <tr><th>Fase</th><td data-prueba="fase">{{ estado.fase }}</td></tr>
        <tr><th>Contenido</th><td data-prueba="contenido">{{ estado.contenido ?? "" }}</td></tr>
        <tr><th>NUIP</th><td data-prueba="nuip">{{ estado.resultado?.campos.nuip ?? "" }}</td></tr>
        <tr><th>Error</th><td data-prueba="error">{{ estado.error?.codigo ?? "" }}</td></tr>
        <tr><th>Motor</th><td data-prueba="motor">{{ motor }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style>
/* UI propia del ejemplo Vue (SDK-12): azul y sin redondeo. */
body { margin: 0; font-family: "Courier New", monospace; background: #eef2ff; color: #111a44; }
.tarjeta { max-width: 680px; margin: 2rem auto; padding: 1rem; background: #fff; }
.camara { position: relative; background: #222; }
video { display: block; width: 100%; }
.guia { position: absolute; border: 2px dotted rgb(30, 90, 255); border-radius: 0px; box-sizing: border-box; }
.botones { display: grid; grid-template-columns: repeat(2, 1fr); gap: .5rem; margin: 1rem 0; }
button { font: inherit; padding: .8rem; border: 0; background: rgb(30, 90, 255); color: #fff; }
th { text-align: left; padding-right: 1rem; }
</style>
```

## Con backend propio

```ts
import { useLectorCedula } from "@lector-cedula/vue";

const { videoRef, estado } = useLectorCedula({ recursos: "/lector-cedula/", backend: "/api/cedula", autoIniciar: true });
```

Recursos: copia los assets a `public/lector-cedula/` (ver [react.md](react.md#vite-recursos-y-service-worker)).
