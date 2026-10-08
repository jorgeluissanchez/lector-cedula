// Worker de calidad de la app (design.md, decisión 2): detector por defecto con la guía de CAM-08.
import { crearDetectorGuia, iniciarWorkerCalidad, type AlcanceWorker } from "@lector-cedula/capture";

iniciarWorkerCalidad(self as unknown as AlcanceWorker, crearDetectorGuia());
