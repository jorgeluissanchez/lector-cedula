from fastapi.testclient import TestClient

from app.main import app


def test_salud_responde_ok() -> None:
    cliente = TestClient(app)
    respuesta = cliente.get("/salud")
    assert respuesta.status_code == 200
    assert respuesta.json() == {"estado": "ok"}
