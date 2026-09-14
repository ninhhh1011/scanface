"""Production connection selection and actual PostgreSQL role privileges."""
import os

import psycopg
import pytest

from app.db import connect


def test_production_never_falls_back_to_hr_database(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("AI_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://must-not-be-used")
    def forbidden(*args, **kwargs):
        raise AssertionError("Production attempted an unrestricted database connection")
    monkeypatch.setattr(psycopg, "connect", forbidden)
    with pytest.raises(ValueError, match="AI_DATABASE_URL_REQUIRED"):
        connect()


def test_ai_database_role_cannot_access_hr_secrets_or_mutate_hr():
    if not os.environ.get("AI_DATABASE_URL"):
        pytest.skip("Requires a provisioned restricted AI_DATABASE_URL")
    for statement in (
        "SELECT password_hash FROM users LIMIT 0",
        "SELECT * FROM payroll_items LIMIT 0",
        "UPDATE employees SET status=status WHERE false",
        "UPDATE users SET locked=locked WHERE false",
        "UPDATE payroll_periods SET status=status WHERE false",
        "UPDATE knowledge_documents SET allowed_roles=allowed_roles WHERE false",
        "UPDATE document_versions SET file_id=file_id WHERE false",
    ):
        with connect() as tx:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                tx.execute(statement)
            tx.rollback()
