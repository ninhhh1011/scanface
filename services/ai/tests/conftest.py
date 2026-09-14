"""Fixture setup is explicitly separate from the restricted runtime connection."""
import os

import psycopg
import pytest
from psycopg.rows import dict_row


def admin_connect():
    url = os.environ.get("DATABASE_URL")
    if not url: pytest.skip("Fixture provisioning requires local test DATABASE_URL")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=5)
