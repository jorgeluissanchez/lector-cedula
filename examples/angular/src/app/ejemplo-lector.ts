import { afterNextRender, Component, computed, signal, viewChild, type ElementRef } from "@angular/core";
import { injectLectorCedula } from "@lector-cedula/angular";
import { precargarMotor } from "@lector-cedula/web";

const recursos = (): string => new URL("/lector-cedula/", location.href).href;

@Component({
  selector: "ejemplo-lector",
  standalone: true,
  template: `
    <main>
      <h2>Validación de identidad</h2>
      <div class="pantalla">
        <video #video playsinline muted></video>
        <div class="guia" data-prueba="guia" [style]="estiloGuia()"></div>
      </div>
      <div class="acciones">
        <button type="button" data-prueba="iniciar" (click)="lector.iniciar()">Leer documento</button>
        <button type="button" data-prueba="precargar" (click)="precargar()">Cargar motor</button>
        <button type="button" data-prueba="cancelar" (click)="lector.cancelar()">Salir</button>
        <button type="button" data-prueba="reintentar" (click)="lector.reintentar()">Intentar de nuevo</button>
      </div>
      <p aria-live="polite">
        Fase: <strong data-prueba="fase">{{ lector.estado().fase }}</strong> ·
        Contenido: <span data-prueba="contenido">{{ lector.estado().contenido ?? "" }}</span> ·
        NUIP: <span data-prueba="nuip">{{ lector.estado().resultado?.campos?.nuip ?? "" }}</span> ·
        Error: <span data-prueba="error">{{ lector.estado().error?.codigo ?? "" }}</span> ·
        Motor: <span data-prueba="motor">{{ motor() }}</span>
      </p>
    </main>
  `,
})
export class EjemploLector {
  // En el navegador la URL de los recursos sale del origen; en servidor el adaptador no crea el controlador.
  readonly lector = injectLectorCedula(typeof location === "undefined" ? {} : { recursos: recursos() });
  readonly motor = signal("");
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>("video");
  readonly estiloGuia = computed(() => {
    const e = this.lector.estado();
    const n = e.guia?.normalizada;
    if (n === undefined || (e.fase !== "activo" && e.fase !== "listo")) return { display: "none" };
    return { display: "block", left: `${n.x * 100}%`, top: `${n.y * 100}%`, width: `${n.ancho * 100}%`, height: `${n.alto * 100}%` };
  });

  constructor() {
    afterNextRender(() => this.lector.video(this.video()));
  }

  precargar(): void {
    this.motor.set("cargando");
    precargarMotor({ recursos: recursos() }).then(
      () => this.motor.set("listo"),
      (e: { codigo?: string }) => this.motor.set(e.codigo ?? "error"),
    );
  }
}
