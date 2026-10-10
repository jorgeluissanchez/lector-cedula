/**
 * @lector-cedula/angular (SDK-32, SDK-34): `injectLectorCedula` traduce `suscribir` del núcleo a una signal. Sin UI ni
 * estilos, standalone, con y sin zone.js (Angular >= 18). Se llama en un contexto de inyección; destruye el controlador
 * con `DestroyRef` y en la plataforma servidor no lo crea (el estado queda en `inicio`).
 */
import { DestroyRef, ElementRef, inject, PLATFORM_ID, signal, type Signal } from "@angular/core";
import { crearLector, ESTADO_INICIAL, type ControladorLector, type DependenciasLector, type EstadoLector, type OpcionesLector } from "@lector-cedula/web";

export type { ControladorLector, DependenciasLector, EstadoLector, OpcionesLector } from "@lector-cedula/web";

/** Para pruebas e integraciones avanzadas: dependencias inyectadas y fábrica del controlador. */
export interface AvanzadoLector {
  readonly deps?: DependenciasLector;
  readonly crear?: (opciones: OpcionesLector, deps?: DependenciasLector) => ControladorLector;
}

export interface LectorCedulaAngular {
  /** Registra el `<video>` (elemento o `ElementRef`, p. ej. desde `viewChild`). */
  video(el: HTMLVideoElement | ElementRef<HTMLVideoElement> | null | undefined): void;
  readonly estado: Signal<EstadoLector>;
  iniciar(): Promise<void>;
  cancelar(): void;
  reintentar(): void;
}

export function injectLectorCedula(opciones: OpcionesLector = {}, avanzado: AvanzadoLector = {}): LectorCedulaAngular {
  const navegador = inject(PLATFORM_ID) === "browser";
  const destruccion = inject(DestroyRef);
  const estado = signal<EstadoLector>(ESTADO_INICIAL);
  let elemento: HTMLVideoElement | null = null;
  let autoIniciado = false;
  const ctl = navegador ? (avanzado.crear ?? crearLector)(opciones, avanzado.deps) : null;
  if (ctl !== null) {
    estado.set(ctl.obtenerEstado());
    ctl.suscribir((e) => estado.set(e));
    // destruir() también vacía los suscriptores (SDK-30).
    destruccion.onDestroy(() => ctl.destruir());
  }
  return {
    video(el) {
      elemento = el instanceof ElementRef ? (el.nativeElement as HTMLVideoElement) : (el ?? null);
      // SDK-49: con `autoIniciar`, la cámara se abre al vincular el vídeo, una sola vez y solo en el navegador.
      if (ctl !== null && elemento !== null && opciones.autoIniciar === true && !autoIniciado) {
        autoIniciado = true;
        void ctl.iniciar(elemento);
      }
    },
    estado: estado.asReadonly(),
    async iniciar() {
      if (ctl !== null && elemento !== null) await ctl.iniciar(elemento);
    },
    cancelar: () => ctl?.cancelar(),
    reintentar: () => ctl?.reintentar(),
  };
}
