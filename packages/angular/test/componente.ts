// Componente de prueba de SDK-32 (JIT, sin decoradores para no depender de la transformación de decoradores).
import "@angular/compiler";
import { Component } from "@angular/core";
import { crearLector, type ControladorLector, type DependenciasLector, type OpcionesLector } from "@lector-cedula/web";
import { injectLectorCedula, type AvanzadoLector } from "../src/index.js";

export const config: { opciones: OpcionesLector; avanzado: AvanzadoLector } = { opciones: {}, avanzado: {} };

export function espia(): { crear: NonNullable<AvanzadoLector["crear"]>; llamadas: number; destruidos: number; ultimo: () => ControladorLector } {
  let ultimo: ControladorLector | null = null;
  const r = {
    llamadas: 0,
    destruidos: 0,
    ultimo: () => ultimo as ControladorLector,
    crear(o: OpcionesLector, d?: DependenciasLector): ControladorLector {
      r.llamadas++;
      const c = crearLector(o, d);
      ultimo = {
        ...c,
        destruir() {
          r.destruidos++;
          c.destruir();
        },
      };
      return ultimo;
    },
  };
  return r;
}

class PruebaLector {
  readonly lector = injectLectorCedula(config.opciones, config.avanzado);
  arrancar(v: HTMLVideoElement): void {
    this.lector.video(v);
    void this.lector.iniciar();
  }
}

export const Prueba = Component({
  selector: "prueba-lector",
  standalone: true,
  template: `<div [attr.data-fase]="lector.estado().fase">
    <video #v></video>
    <span data-prueba="fase">{{ lector.estado().fase }}</span>
    <span data-prueba="nuip">{{ lector.estado().resultado?.campos?.nuip ?? "" }}</span>
    <span data-prueba="error">{{ lector.estado().error?.codigo ?? "" }}</span>
    <button data-prueba="iniciar" (click)="arrancar(v)">Iniciar</button>
    <button data-prueba="cancelar" (click)="lector.cancelar()">Cancelar</button>
    <button data-prueba="reintentar" (click)="lector.reintentar()">Reintentar</button>
  </div>`,
})(PruebaLector) as typeof PruebaLector;
