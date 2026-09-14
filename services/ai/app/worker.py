"""Durable PostgreSQL polling worker. No schema mutation or runtime fake providers."""
import argparse
import hashlib
import json
import multiprocessing
import os
import queue
import time
from urllib.parse import quote

import httpx
from psycopg.types.json import Jsonb

from app.db import connect, audit, uid
from app.ingestion import extract, chunks, embed, embedding_config, IngestionError, MAX_FILE
from app.security import sign_scope


def extract_child(result, data, filename, mime):
    try:
        import logging
        logging.getLogger("pypdf").disabled = True  # Parser diagnostics may contain private source fragments.
        if os.name == "posix":
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
        result.put((True, chunks(extract(data, filename, mime))))
    except Exception as exc: result.put((False, str(exc) if isinstance(exc, IngestionError) else "DOCUMENT_PARSE_FAILED"))


def bounded_extract(data, filename, mime):
    if os.name != "posix":
        return chunks(extract(data, filename, mime))
    context = multiprocessing.get_context("spawn")
    result = context.Queue(maxsize=1)
    process = context.Process(target=extract_child, args=(result, data, filename, mime), daemon=True)
    process.start()
    try:
        ok, value = result.get(timeout=30)
        if not ok: raise IngestionError(value)
        return value
    except queue.Empty: raise IngestionError("DOCUMENT_PARSE_TIMEOUT") from None
    finally:
        if process.is_alive(): process.terminate()
        process.join(timeout=5)
        result.close()


def download_file(file_id):
    base = os.environ.get("APP_URL", "").rstrip("/")
    key = os.environ.get("SERVICE_AUTH_KEY", "")
    if not base or len(key) < 32: raise IngestionError("FILE_SERVICE_NOT_CONFIGURED")
    origin = httpx.URL(base)
    if origin.scheme != "https" and not (origin.scheme == "http" and origin.host in ("localhost", "127.0.0.1", "host.docker.internal")):
        raise IngestionError("FILE_SERVICE_URL_INVALID")
    if origin.username or origin.password or origin.query or origin.fragment: raise IngestionError("FILE_SERVICE_URL_INVALID")
    token = sign_scope({"actor_id": "ingestion-worker", "session_id": "ingestion-worker", "employee_id": file_id, "action": "INGEST", "exp": int(time.time())+60, "nonce": uid()}, key)
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        with client.stream("GET", base+"/api/internal/files/"+quote(file_id, safe=""), headers={"Authorization": "Bearer "+key, "X-ABC-Scope": token}) as response:
            response.raise_for_status()
            data = bytearray()
            for block in response.iter_bytes():
                data.extend(block)
                if len(data) > MAX_FILE: raise IngestionError("FILE_SIZE_INVALID")
            return bytes(data), response.headers.get("x-file-name", ""), response.headers.get("content-type", "").split(";")[0]


def claim():
    with connect() as tx:
        # A crashed final attempt becomes FAILED instead of remaining PROCESSING forever.
        stale = tx.execute("UPDATE ingestion_jobs SET status='FAILED',error_code='WORKER_LEASE_EXPIRED',locked_at=NULL,updated_at=now() WHERE status='PROCESSING' AND locked_at<now()-interval '5 minutes' AND attempts>=3 RETURNING version_id").fetchall()
        for row in stale: tx.execute("UPDATE document_versions SET status='FAILED' WHERE id=%s AND status='PROCESSING'", (row["version_id"],))
        job = tx.execute("SELECT * FROM ingestion_jobs WHERE attempts<3 AND ((status='QUEUED' AND available_at<=now()) OR (status='PROCESSING' AND locked_at<now()-interval '5 minutes')) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1").fetchone()
        if not job: return None
        job = tx.execute("UPDATE ingestion_jobs SET status='PROCESSING',attempts=attempts+1,locked_at=now(),updated_at=now(),error_code=NULL WHERE id=%s RETURNING *", (job["id"],)).fetchone()
        version = tx.execute("SELECT v.*,d.owner_id,d.status AS document_status FROM document_versions v JOIN knowledge_documents d ON d.id=v.document_id WHERE v.id=%s FOR UPDATE OF v", (job["version_id"],)).fetchone()
        if not version or version["status"] == "INACTIVE" or version["document_status"] in ("INACTIVE", "DELETED"):
            tx.execute("UPDATE ingestion_jobs SET status='INACTIVE',locked_at=NULL,updated_at=now() WHERE id=%s", (job["id"],))
            return None
        tx.execute("UPDATE document_versions SET status='PROCESSING' WHERE id=%s", (job["version_id"],))
        return job, version


def save_checkpoint(job, checkpoint):
    with connect() as tx:
        row = tx.execute("UPDATE ingestion_jobs SET checkpoint=%s,locked_at=now(),updated_at=now() WHERE id=%s AND status='PROCESSING' AND attempts=%s AND locked_at=%s RETURNING locked_at", (Jsonb(checkpoint), job["id"], job["attempts"], job["locked_at"])).fetchone()
        if not row: raise IngestionError("JOB_LEASE_LOST")
        job["locked_at"] = row["locked_at"]


def process_job(job, version):
    _, _, model, dimension = embedding_config()
    data, filename, mime = download_file(version["file_id"])
    content_hash = hashlib.sha256(data).hexdigest()
    checkpoint = job.get("checkpoint")
    if not checkpoint or any(checkpoint.get(k) != v for k, v in {"content_hash": content_hash, "model": model, "dimension": dimension}.items()):
        checkpoint = {"content_hash": content_hash, "model": model, "dimension": dimension, "chunks": bounded_extract(data, filename, mime), "vectors": []}
        save_checkpoint(job, checkpoint)
    data = None
    parts, vectors = checkpoint["chunks"], checkpoint["vectors"]
    while len(vectors) < len(parts):
        batch = parts[len(vectors):len(vectors)+16]
        vectors.extend(embed([part["content"] for part in batch]))
        save_checkpoint(job, checkpoint)
    with connect() as tx:
        document = tx.execute("SELECT status FROM knowledge_documents WHERE id=%s FOR UPDATE", (version["document_id"],)).fetchone()
        current = tx.execute("SELECT status FROM document_versions WHERE id=%s FOR UPDATE", (version["id"],)).fetchone()
        if not document or document["status"] in ("INACTIVE", "DELETED") or not current or current["status"] != "PROCESSING": raise IngestionError("DOCUMENT_INACTIVE")
        lease = tx.execute("SELECT * FROM ingestion_jobs WHERE id=%s FOR UPDATE", (job["id"],)).fetchone()
        if not lease or lease["status"] != "PROCESSING" or lease["attempts"] != job["attempts"] or lease["locked_at"] != job["locked_at"]: raise IngestionError("JOB_LEASE_LOST")
        tx.execute("DELETE FROM document_chunks WHERE version_id=%s", (version["id"],))
        for ordinal, (part, vector) in enumerate(zip(parts, vectors, strict=True)):
            tx.execute("INSERT INTO document_chunks(id,version_id,ordinal,content,section,page,embedding_model,embedding_dimension,embedding,content_hash,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s,now())", (uid(), version["id"], ordinal, part["content"], part["section"], part["page"], model, dimension, json.dumps(vector), part["content_hash"]))
        tx.execute("UPDATE document_versions SET status='READY',content_hash=%s WHERE id=%s", (content_hash, version["id"]))
        tx.execute("UPDATE ingestion_jobs SET status='READY',checkpoint=NULL,error_code=NULL,locked_at=NULL,updated_at=now() WHERE id=%s", (job["id"],))
        audit(tx, version["owner_id"], "KNOWLEDGE_INDEX", "document_versions", version["id"], after={"chunk_count": len(parts), "embedding_model": model, "dimension": dimension})


def run_once():
    selected = claim()
    if not selected: return False
    job, version = selected
    try:
        process_job(job, version)
        print(json.dumps({"event": "ingestion", "job_id": job["id"], "status": "READY"}), flush=True)
    except Exception as exc:
        code = str(exc) if isinstance(exc, IngestionError) else "INGESTION_ERROR"
        # Only our fixed reason codes, never parser/provider/SQL exception strings.
        if not code.replace("_", "").isalnum() or len(code) > 80: code = "INGESTION_ERROR"
        with connect() as tx:
            row = tx.execute("UPDATE ingestion_jobs SET status=CASE WHEN attempts>=3 THEN 'FAILED' ELSE 'QUEUED' END,error_code=%s,locked_at=NULL,available_at=now()+interval '30 seconds'*attempts,updated_at=now() WHERE id=%s AND attempts=%s AND locked_at=%s AND status='PROCESSING' RETURNING status", (code, job["id"], job["attempts"], job["locked_at"])).fetchone()
            if row:
                tx.execute("UPDATE document_versions SET status=%s WHERE id=%s AND status='PROCESSING'", (row["status"], version["id"]))
                audit(tx, version["owner_id"], "KNOWLEDGE_INDEX", "document_versions", version["id"], "FAILED", code)
        print(json.dumps({"event": "ingestion", "job_id": job["id"], "error_code": code}), flush=True)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    while True:
        try: worked = run_once()
        except Exception:
            worked = False
            print('{"event":"worker","error_code":"DATABASE_UNAVAILABLE"}', flush=True)
        if args.once: break
        if not worked: time.sleep(3)
