"""API de respaldo del lector de cédula.

Principio III: ningún endpoint escribe imágenes ni datos personales a disco o a logs.
Las capacidades (re-decodificación PDF417, OCR, validaciones) llegan en la Fase 4 según su spec.
"""

from fastapi import FastAPI

app = FastAPI(title="Lector cédula CO", version="0.0.0", docs_url="/docs", redoc_url=None)


@app.get("/salud")
def salud() -> dict[str, str]:
    """Comprobación de vida para el orquestador de contenedores."""
    return {"estado": "ok"}
