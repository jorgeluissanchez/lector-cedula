"use client";
/**
 * @lector-cedula/react (SDK-31, SDK-34): `useLectorCedula` traduce `suscribir` del núcleo a `useSyncExternalStore`. Sin
 * UI ni estilos. SSR-safe: en el servidor y en el primer render el estado es `ESTADO_INICIAL` (fase `inicio`) y el
 * controlador solo se crea en `useEffect` (navegador); al desmontar se llama `destruir()`.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { crearLector, ESTADO_INICIAL, type ControladorLector, type DependenciasLector, type EstadoLector, type OpcionesLector } from "@lector-cedula/web";

export type { ControladorLector, DependenciasLector, EstadoLector, OpcionesLector } from "@lector-cedula/web";

/** Para pruebas e integraciones avanzadas: dependencias inyectadas y fábrica del controlador. */
export interface AvanzadoLector {
  readonly deps?: DependenciasLector;
  readonly crear?: (opciones: OpcionesLector, deps?: DependenciasLector) => ControladorLector;
}

export interface LectorCedulaReact {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly estado: EstadoLector;
  iniciar(): Promise<void>;
  cancelar(): void;
  reintentar(): void;
}

const nada = (): void => undefined;
const inicial = (): EstadoLector => ESTADO_INICIAL;

export function useLectorCedula(opciones: OpcionesLector = {}, avanzado: AvanzadoLector = {}): LectorCedulaReact {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ctl, fijar] = useState<ControladorLector | null>(null);
  // El controlador se recrea solo si cambian las opciones (por valor), no en cada render.
  const clave = JSON.stringify(opciones);
  const ultimo = useRef<{ opciones: OpcionesLector; avanzado: AvanzadoLector } | null>(null);
  ultimo.current = { opciones, avanzado };
  useEffect(() => {
    const { opciones: o, avanzado: a } = ultimo.current as { opciones: OpcionesLector; avanzado: AvanzadoLector };
    const c = (a.crear ?? crearLector)(o, a.deps);
    fijar(c);
    // SDK-49: con `autoIniciar`, la cámara se abre al vincular el vídeo (efecto: solo en el navegador).
    if (o.autoIniciar === true && videoRef.current !== null) void c.iniciar(videoRef.current);
    return () => c.destruir();
  }, [clave]);
  const suscribir = useCallback((fn: () => void) => (ctl === null ? nada : ctl.suscribir(fn)), [ctl]);
  const leer = useCallback(() => (ctl === null ? ESTADO_INICIAL : ctl.obtenerEstado()), [ctl]);
  const estado = useSyncExternalStore(suscribir, leer, inicial);
  const iniciar = useCallback(async () => {
    const v = videoRef.current;
    if (ctl !== null && v !== null) await ctl.iniciar(v);
  }, [ctl]);
  const cancelar = useCallback(() => ctl?.cancelar(), [ctl]);
  const reintentar = useCallback(() => ctl?.reintentar(), [ctl]);
  return { videoRef, estado, iniciar, cancelar, reintentar };
}
