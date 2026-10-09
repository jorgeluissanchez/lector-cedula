// Ejemplo Angular (SDK-12, SDK-32, SDK-37): standalone y zoneless (sin zone.js), UI propia, sin servidor.
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { EjemploLector } from "./app/ejemplo-lector";

bootstrapApplication(EjemploLector, { providers: [provideZonelessChangeDetection()] }).catch((e: unknown) => console.error(e));
