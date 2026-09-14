import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hmac
import os
import secrets
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.db import connect, audit, uid
from app.face import FaceEngine, FaceError, match_identity
from app.security import verify_scope, encryption_key, encrypt_template, decrypt_template

engine = None
model_error = "NOT_LOADED"


@asynccontextmanager
async def lifespan(app):
    global engine, model_error
    try:
        engine = FaceEngine()
        model_error = None
    except Exception:
        model_error = "MODEL_LOAD_OR_SELF_CHECK_FAILED"
    yield


app = FastAPI(title="ABC HRM private AI service", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class LimitBody:
    """Bound chunked and Content-Length payloads before FastAPI JSON decoding."""
    def __init__(self, app): self.app = app
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http": return await self.app(scope, receive, send)
        received = 0
        async def bounded():
            nonlocal received
            message = await asyncio.wait_for(receive(), timeout=20)
            received += len(message.get("body", b""))
            if received > 10_100_000: raise HTTPException(413, "PAYLOAD_TOO_LARGE")
            return message
        await self.app(scope, bounded, send)


app.add_middleware(LimitBody)


@app.middleware("http")
async def no_store(request, call_next):
    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse({"error": {"code": "SERVICE_UNAVAILABLE", "message": "Dịch vụ tạm thời chưa sẵn sàng."}}, status_code=503)
    response.headers["Cache-Control"] = "private, no-store"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse({"error": {"code": str(exc.detail), "message": str(exc.detail)}}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Do not serialize pydantic inputs: these include raw base64 camera frames.
    return JSONResponse({"error": {"code": "VALIDATION_ERROR", "message": "Dữ liệu không hợp lệ."}}, status_code=422)


def authorize(request, expected=None):
    key = os.environ.get("SERVICE_AUTH_KEY", "")
    if len(key) < 32 or not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + key):
        raise HTTPException(401, "PERMISSION_DENIED")
    try:
        scope = verify_scope(request.headers.get("x-abc-scope", ""), key, expected or {})
    except ValueError:
        raise HTTPException(403, "PERMISSION_DENIED") from None
    with connect() as tx:
        tx.execute("DELETE FROM service_nonces WHERE expires_at<now()-interval '1 minute'")
        inserted = tx.execute("INSERT INTO service_nonces(nonce,expires_at) VALUES(%s,to_timestamp(%s)) ON CONFLICT DO NOTHING RETURNING nonce", (scope["nonce"], scope["exp"])).fetchone()
        if not inserted: raise HTTPException(409, "SCOPE_REPLAYED")
    return scope


def current_session(tx, scope):
    row = tx.execute("SELECT * FROM public.face_session_scope(%s,%s,%s)", (scope["session_id"], scope["actor_id"], scope["employee_id"])).fetchone()
    if not row: raise HTTPException(403, "SESSION_EXPIRED")
    if scope["action"] in ("CHECK_IN", "CHECK_OUT") and row["employee_id"] != scope["employee_id"]:
        raise HTTPException(403, "EMPLOYEE_SCOPE_MISMATCH")
    if scope["action"] in ("ENROLL", "DELETE") and row["employee_id"] != scope["employee_id"] and row["role"] != "SUPER_ADMIN" and "hr:write" not in row["capabilities"]:
        raise HTTPException(403, "PERMISSION_DENIED")
    if scope["action"] != "DELETE" and row["status"] != "ACTIVE": raise HTTPException(403, "EMPLOYEE_INACTIVE")


def get_engine():
    if engine is None: raise HTTPException(503, "SERVICE_UNAVAILABLE")
    try: encryption_key()
    except ValueError: raise HTTPException(503, "SERVICE_UNAVAILABLE") from None
    return engine


@app.get("/healthz")
def health(): return {"status": "ok"}


@app.get("/readyz")
def ready(request: Request):
    key = os.environ.get("SERVICE_AUTH_KEY", "")
    if len(key) < 32 or not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer "+key):
        raise HTTPException(401, "PERMISSION_DENIED")
    state = {"models_ready": engine is not None, "inference_checked": engine is not None, "database_ready": False, "encryption_ready": False}
    try:
        encryption_key()
        state["encryption_ready"] = True
        with connect() as tx: tx.execute("SELECT 1 FROM face_profiles LIMIT 1")
        state["database_ready"] = True
    except Exception: pass
    ok = all(state.values())
    return JSONResponse({"status": "ready" if ok else "not_ready", **state, "model_version": engine.model_version if engine else None, "dimension": engine.dimension if engine else None}, status_code=200 if ok else 503)


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ChallengeBody(StrictBody):
    employee_id: str = Field(min_length=1, max_length=200)
    session_id: str = Field(min_length=1, max_length=200)
    actor_id: str = Field(min_length=1, max_length=200)
    action: Literal["ENROLL", "CHECK_IN", "CHECK_OUT"]
    consent: bool


class Frame(StrictBody):
    image: str = Field(min_length=10, max_length=1_000_000, repr=False)
    captured_at: int = Field(gt=0)


class VerifyBody(StrictBody):
    challenge_id: str = Field(min_length=1, max_length=200)
    frames: list[Frame] = Field(min_length=5, max_length=10, repr=False)


class EnrollBody(VerifyBody):
    employee_id: str = Field(min_length=1, max_length=200)


@app.post("/face/challenge")
def challenge(body: ChallengeBody, request: Request):
    scope = authorize(request, body.model_dump(exclude={"consent"}))
    get_engine()
    if not body.consent: raise HTTPException(400, "CONSENT_REQUIRED")
    challenge_id, direction = uid(), secrets.choice(["LEFT", "RIGHT"])
    expires = datetime.now(timezone.utc)+timedelta(seconds=60)
    with connect() as tx:
        current_session(tx, scope)
        # Serialize per-session issuance to keep one live challenge and bound expensive scans.
        tx.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (scope["session_id"],))
        count = tx.execute("SELECT count(*) AS n FROM face_challenges WHERE session_id=%s AND created_at>now()-interval '1 minute'", (scope["session_id"],)).fetchone()["n"]
        if count >= 6: raise HTTPException(429, "RATE_LIMITED")
        tx.execute("UPDATE face_challenges SET consumed_at=coalesce(consumed_at,now()),expires_at=now() WHERE session_id=%s AND expires_at>now()", (scope["session_id"],))
        tx.execute("INSERT INTO face_challenges(id,employee_id,actor_id,session_id,action,direction,nonce,expires_at,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,now())", (challenge_id, body.employee_id, body.actor_id, body.session_id, body.action, direction, scope["nonce"], expires))
        if body.action == "ENROLL":
            tx.execute("INSERT INTO enrollment_consents(id,employee_id,actor_id,purpose,accepted_at) VALUES(%s,%s,%s,%s,now())", (uid(), body.employee_id, body.actor_id, "FACE_ATTENDANCE_ENROLLMENT"))
        audit(tx, body.actor_id, "FACE_CONSENT", "employees", body.employee_id, after={"purpose": body.action})
    return {"challenge_id": challenge_id, "direction": direction, "expires_at": expires.isoformat(), "instructions": "Nhìn thẳng → quay nhẹ sang " + ("trái" if direction == "LEFT" else "phải") + " của bạn → nhìn thẳng. Giữ mỗi bước khoảng một giây."}


def consume_challenge(tx, scope, challenge_id):
    current_session(tx, scope)
    row = tx.execute("SELECT * FROM face_challenges WHERE id=%s FOR UPDATE", (challenge_id,)).fetchone()
    if not row or row["consumed_at"] or row["expires_at"] <= datetime.now(timezone.utc): raise HTTPException(409, "CHALLENGE_EXPIRED_OR_USED")
    if any(row[k] != scope[k] for k in ("actor_id", "session_id", "employee_id", "action")): raise HTTPException(403, "PERMISSION_DENIED")
    tx.execute("UPDATE face_challenges SET consumed_at=now() WHERE id=%s", (challenge_id,))
    return row


def templates(tx, face_engine):
    # No template cache; deletion is immediately visible to subsequent matching transactions.
    rows = tx.execute("SELECT p.employee_id,t.ciphertext,t.dimension FROM face_templates t JOIN face_profiles p ON p.id=t.profile_id JOIN employees e ON e.id=p.employee_id WHERE p.status='ENROLLED' AND e.status='ACTIVE' AND p.model_version=%s AND t.model_version=%s AND p.dimension=%s AND t.dimension=%s", (face_engine.model_version, face_engine.model_version, face_engine.dimension, face_engine.dimension)).fetchall()
    key = encryption_key()
    return [(r["employee_id"], decrypt_template(r["ciphertext"], key, r["employee_id"], face_engine.model_version, r["dimension"])) for r in rows]


def scan(body, request, enroll):
    scope = authorize(request, {"action": "ENROLL", "employee_id": body.employee_id} if enroll else {})
    if not enroll and scope["action"] not in ("CHECK_IN", "CHECK_OUT"): raise HTTPException(403, "PERMISSION_DENIED")
    face_engine = get_engine()
    # Consume before inference in a separate transaction. Failed or interrupted attempts cannot replay.
    with connect() as tx: selected = consume_challenge(tx, scope, body.challenge_id)
    try:
        vectors, vector = face_engine.sequence(body.frames, selected)
    except FaceError as exc:
        with connect() as tx: audit(tx, scope["actor_id"], "FACE_ENROLL" if enroll else "FACE_VERIFY", "employees", scope["employee_id"], "DENIED", str(exc))
        return {"status": str(exc)}
    with connect() as tx:
        # ponytail: global biometric write/proof lock; sufficient for small HR deployments.
        tx.execute("SELECT pg_advisory_xact_lock(734901)")
        current_session(tx, scope)
        still_valid = tx.execute("SELECT id FROM face_challenges WHERE id=%s AND expires_at>now() FOR SHARE", (body.challenge_id,)).fetchone()
        if not still_valid: raise HTTPException(409, "CHALLENGE_EXPIRED_OR_USED")
        stored = templates(tx, face_engine)
        if enroll:
            others = [(i, v) for i, v in stored if i != scope["employee_id"]]
            duplicate, _ = match_identity(vector, others, face_engine.threshold, face_engine.margin)
            if duplicate in ("MATCHED", "AMBIGUOUS_MATCH"):
                audit(tx, scope["actor_id"], "FACE_ENROLL", "employees", scope["employee_id"], "DENIED", "DUPLICATE_FACE")
                return {"status": "DUPLICATE_FACE"}
            profile = tx.execute("SELECT id FROM face_profiles WHERE employee_id=%s", (scope["employee_id"],)).fetchone()
            profile_id = profile["id"] if profile else uid()
            tx.execute("INSERT INTO face_profiles(id,employee_id,status,model_version,dimension,sample_count,updated_at) VALUES(%s,%s,'ENROLLED',%s,%s,%s,now()) ON CONFLICT(employee_id) DO UPDATE SET status='ENROLLED',model_version=excluded.model_version,dimension=excluded.dimension,sample_count=excluded.sample_count,updated_at=now()", (profile_id, scope["employee_id"], face_engine.model_version, face_engine.dimension, len(vectors)))
            tx.execute("DELETE FROM face_templates WHERE profile_id=%s", (profile_id,))
            for item in vectors:
                tx.execute("INSERT INTO face_templates(id,profile_id,ciphertext,model_version,dimension,created_at) VALUES(%s,%s,%s,%s,%s,now())", (uid(), profile_id, encrypt_template(item, encryption_key(), scope["employee_id"], face_engine.model_version), face_engine.model_version, face_engine.dimension))
            tx.execute("UPDATE face_verifications SET consumed_at=now() WHERE employee_id=%s AND consumed_at IS NULL", (scope["employee_id"],))
            audit(tx, scope["actor_id"], "FACE_ENROLL", "employees", scope["employee_id"], after={"sample_count": len(vectors), "model_version": face_engine.model_version})
            result = {"status": "ENROLLED", "employee_id": scope["employee_id"], "sample_count": len(vectors), "model_version": face_engine.model_version}
        else:
            status, matched = match_identity(vector, stored, face_engine.threshold, face_engine.margin)
            if status == "MATCHED" and matched != scope["employee_id"]: status = "UNKNOWN_PERSON"
            result = {"status": status}
            if status == "MATCHED":
                proof_id = uid()
                tx.execute("INSERT INTO face_verifications(id,employee_id,session_id,action,challenge_id,model_version,expires_at,created_at) VALUES(%s,%s,%s,%s,%s,%s,now()+interval '30 seconds',now())", (proof_id, matched, scope["session_id"], scope["action"], body.challenge_id, face_engine.model_version))
                result["proof_id"] = proof_id
            audit(tx, scope["actor_id"], "FACE_VERIFY", "employees", scope["employee_id"], "SUCCESS" if status == "MATCHED" else "DENIED", status)
    return result


@app.post("/face/enroll")
def enroll(body: EnrollBody, request: Request): return scan(body, request, True)


@app.post("/face/verify")
def verify_face(body: VerifyBody, request: Request): return scan(body, request, False)


@app.delete("/face/profiles/{employee_id}")
def delete_profile(employee_id: str, request: Request):
    scope = authorize(request, {"employee_id": employee_id, "action": "DELETE"})
    with connect() as tx:
        tx.execute("SELECT pg_advisory_xact_lock(734901)")
        current_session(tx, scope)
        tx.execute("DELETE FROM face_templates WHERE profile_id IN (SELECT id FROM face_profiles WHERE employee_id=%s)", (employee_id,))
        tx.execute("DELETE FROM face_profiles WHERE employee_id=%s", (employee_id,))
        tx.execute("UPDATE enrollment_consents SET revoked_at=now() WHERE employee_id=%s AND revoked_at IS NULL", (employee_id,))
        tx.execute("UPDATE face_verifications SET consumed_at=now() WHERE employee_id=%s AND consumed_at IS NULL", (employee_id,))
        tx.execute("UPDATE face_challenges SET consumed_at=coalesce(consumed_at,now()),expires_at=now() WHERE employee_id=%s AND expires_at>now()", (employee_id,))
        audit(tx, scope["actor_id"], "FACE_DELETE", "employees", employee_id)
    return {"status": "DELETED", "employee_id": employee_id}
