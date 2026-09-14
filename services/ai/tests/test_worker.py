"""Durable real-DB failure/retry test. No generated/fake embeddings stored."""
import pytest

from app.db import uid
from app.worker import run_once, bounded_extract
from conftest import admin_connect


def test_bounded_extraction_subprocess():
    parts = bounded_extract(b"# Policy\n\nExample text", "policy.md", "text/markdown")
    assert parts[0]["section"] == "Policy"


def test_durable_missing_provider_fails_without_ready_or_chunks(monkeypatch):
    import os
    if not os.environ.get("DATABASE_URL") and not os.environ.get("AI_DATABASE_URL"):
        pytest.skip("Real PostgreSQL integration requires configured local environment")
    monkeypatch.delenv("EMBEDDING_BASE_URL", raising=False)
    document, version, file, job = uid(), uid(), uid(), uid()
    with admin_connect() as tx:
        actor = tx.execute("SELECT id FROM users LIMIT 1").fetchone()["id"]
        tx.execute("INSERT INTO documents(id,owner_id,title,filename,mime_type,size,storage_key,classification,created_at) VALUES(%s,%s,'Protocol test','test.txt','text/plain',1,%s,'GENERAL',now())", (file, actor, "test/"+file))
        tx.execute("INSERT INTO knowledge_documents(id,title,owner_id,classification,allowed_roles,status,created_at) VALUES(%s,'Protocol test',%s,'GENERAL',ARRAY['HR_ADMIN'],'DRAFT',now())", (document, actor))
        tx.execute("INSERT INTO document_versions(id,document_id,version,effective_from,file_id,status,created_at) VALUES(%s,%s,'test',now(),%s,'QUEUED',now())", (version, document, file))
        tx.execute("INSERT INTO ingestion_jobs(id,version_id,status,attempts,available_at,created_at,updated_at) VALUES(%s,%s,'QUEUED',0,now()-interval '10 years',now(),now())", (job, version))
    try:
        for attempt in range(1, 4):
            assert run_once()
            with admin_connect() as tx:
                state = tx.execute("SELECT status,attempts,error_code FROM ingestion_jobs WHERE id=%s", (job,)).fetchone()
                assert state["attempts"] == attempt
                assert state["status"] == ("FAILED" if attempt == 3 else "QUEUED")
                assert state["error_code"] == "EMBEDDINGS_NOT_CONFIGURED"
                assert tx.execute("SELECT count(*) AS n FROM document_chunks WHERE version_id=%s", (version,)).fetchone()["n"] == 0
                tx.execute("UPDATE ingestion_jobs SET available_at=now()-interval '10 years' WHERE id=%s", (job,))
    finally:
        with admin_connect() as tx:
            tx.execute("DELETE FROM audit_events WHERE resource_id=%s", (version,))
            tx.execute("DELETE FROM ingestion_jobs WHERE id=%s", (job,))
            tx.execute("DELETE FROM document_versions WHERE id=%s", (version,))
            tx.execute("DELETE FROM knowledge_documents WHERE id=%s", (document,))
            tx.execute("DELETE FROM documents WHERE id=%s", (file,))
