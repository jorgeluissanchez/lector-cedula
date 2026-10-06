"""Rutas de `/v1/validations`.

Las operaciones que aún no tienen tarea implementada responden 501 (tarea 2.2); la paridad de rutas
con el contrato ya se exige (AV-01). Toda ruta exige `Authorization: Bearer <clave>` (AV-02), salvo la
subida con token firmado (AV-08), que se verifica en la tarea 5.1.
"""

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request

from app.almacen import Almacen, Validacion
from app.auth import Cliente, cliente_requerido
from app.errores import ErrorApi
from app.modelos import CrearValidacion

ClienteAutenticado = Annotated[Cliente, Depends(cliente_requerido)]


def _almacen(request: Request) -> Almacen:
    return request.app.state.almacen


def _validacion_del_cliente(request: Request, id_validacion: str, cliente: Cliente) -> Validacion:
    """La validación del cliente o 404 `not-found`, idéntico para inexistente, mal formada o ajena."""
    validacion = _almacen(request).obtener(id_validacion, propietario=cliente.hash_clave)
    if validacion is None:
        raise ErrorApi(404, "not-found")
    request.state.validation_id = validacion.id
    return validacion


def registrar(aplicacion: FastAPI) -> None:
    """Registra las operaciones en la aplicación (no en un router incluido) para que la prueba de
    paridad las lea de `aplicacion.routes`."""

    @aplicacion.post("/v1/validations")
    async def crear_validacion(cuerpo: CrearValidacion, cliente: ClienteAutenticado) -> None:
        raise HTTPException(status_code=501)

    @aplicacion.get("/v1/validations/{id}")
    async def obtener_validacion(id: str, request: Request, cliente: ClienteAutenticado) -> None:
        _validacion_del_cliente(request, id, cliente)
        raise HTTPException(status_code=501)

    @aplicacion.delete("/v1/validations/{id}")
    async def suprimir_validacion(id: str, request: Request, cliente: ClienteAutenticado) -> None:
        _validacion_del_cliente(request, id, cliente)
        raise HTTPException(status_code=501)

    @aplicacion.post("/v1/validations/{id}/images")
    async def subir_imagenes(id: str, request: Request) -> None:
        if "token" not in request.query_params:
            _validacion_del_cliente(request, id, await cliente_requerido(request))
        raise HTTPException(status_code=501)
