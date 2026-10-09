/**
 * @lector-cedula/vue (SDK-33, SDK-34): `useLectorCedula` traduce `suscribir` del núcleo a un `shallowRef`. Sin UI ni
 * estilos. El controlador se crea en `onMounted` (nunca en SSR) y se destruye en `onBeforeUnmount`.
 */
import { onBeforeUnmount, onMounted, shallowRef, type Ref, type ShallowRef } from "vue";
import { crearLector, ESTADO_INICIAL, type ControladorLector, type DependenciasLector, type EstadoLector, type OpcionesLector } from "@lector-cedula/web";

export type { ControladorLector, DependenciasLector, EstadoLector, OpcionesLector } from "@lector-cedula/web";

/** Para pruebas e integraciones avanzadas: dependencias inyectadas y fábrica del controlador. */
export interface AvanzadoLector {
  readonly deps?: DependenciasLector;
  readonly crear?: (opciones: OpcionesLector, deps?: DependenciasLector) => ControladorLector;
}

export interface LectorCedulaVue {
  readonly videoRef: Ref<HTMLVideoElement | null>;
  readonly estado: Readonly<ShallowRef<EstadoLector>>;
  iniciar(): Promise<void>;
  cancelar(): void;
  reintentar(): void;
}

export function useLectorCedula(opciones: OpcionesLector = {}, avanzado: AvanzadoLector = {}): LectorCedulaVue {
  const videoRef = shallowRef<HTMLVideoElement | null>(null);
  const estado = shallowRef<EstadoLector>(ESTADO_INICIAL);
  let ctl: ControladorLector | null = null;
  onMounted(() => {
    const c = (avanzado.crear ?? crearLector)(opciones, avanzado.deps);
    ctl = c;
    estado.value = c.obtenerEstado();
    c.suscribir((e) => {
      estado.value = e;
    });
  });
  onBeforeUnmount(() => {
    // destruir() también vacía los suscriptores (SDK-30); onBeforeUnmount siempre sigue a onMounted.
    (ctl as ControladorLector).destruir();
    ctl = null;
  });
  return {
    videoRef,
    estado,
    async iniciar() {
      if (ctl !== null && videoRef.value !== null) await ctl.iniciar(videoRef.value);
    },
    cancelar: () => ctl?.cancelar(),
    reintentar: () => ctl?.reintentar(),
  };
}
