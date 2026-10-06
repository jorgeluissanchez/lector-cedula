"""Tarea 1.1: base del servidor (perfil de Hypothesis y servicios de Compose)."""

from pathlib import Path

from hypothesis import settings

RAIZ = Path(__file__).resolve().parents[1]


def test_perfil_ci_de_hypothesis_activo() -> None:
    """El perfil `ci` no escribe base de ejemplos en disco y no impone deadline."""
    actual = settings()
    assert actual.database is None
    assert actual.deadline is None


def test_registro_de_hipotesis_montado() -> None:
    """`docs/decisiones/hipotesis-formato.md` está disponible en solo lectura para AV-19."""
    from tests.utilidades import RUTA_HIPOTESIS

    assert RUTA_HIPOTESIS.is_file()
    assert "| H03 |" in RUTA_HIPOTESIS.read_text(encoding="utf-8")
