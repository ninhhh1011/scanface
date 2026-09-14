"""Real HTTP and PostgreSQL protocol integration; no biometric fixtures/enrollment."""
import base64
import os
import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.db import connect, uid
from app.main import app
from app.security import sign_scope
from conftest import admin_connect


@pytest.fixture
def client():
    if not os.environ.get("DATABASE_URL") and not os.environ.get("AI_DATABASE_URL"):
        pytest.skip("Real PostgreSQL integration requires configured local environment")
    with TestClient(app) as value:
        yield value


@pytest.fixture
def principal():
    actor, session = uid(), uid()
    with admin_connect() as tx:
        employee = tx.execute("SELECT id FROM employees WHERE status='ACTIVE' ORDER BY code LIMIT 1").fetchone()["id"]
        tx.execute("INSERT INTO users(id,email,password_hash,role,capabilities,locked,created_at) VALUES(%s,%s,'TEST_UNUSABLE','HR_ADMIN',ARRAY['hr:write'],false,now())", (actor, actor+"@test.invalid"))
        tx.execute("INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(%s,%s,now()+interval '10 minutes',now())", (session, actor))
    yield {"actor_id": actor, "session_id": session, "employee_id": employee, "action": "ENROLL"}
    with admin_connect() as tx:
        tx.execute("DELETE FROM face_challenges WHERE actor_id=%s", (actor,))
        tx.execute("DELETE FROM enrollment_consents WHERE actor_id=%s", (actor,))
        tx.execute("DELETE FROM audit_events WHERE actor_id=%s", (actor,))
        tx.execute("DELETE FROM sessions WHERE id=%s", (session,))
        tx.execute("DELETE FROM users WHERE id=%s", (actor,))


def headers(principal):
    scope = {**principal, "exp": int(time.time())+60, "nonce": uid()}
    key = os.environ["SERVICE_AUTH_KEY"]
    return {"Authorization": "Bearer "+key, "X-ABC-Scope": sign_scope(scope, key)}


def test_readiness_auth_real_model_and_db(client):
    assert client.get("/readyz").status_code == 401
    response = client.get("/readyz", headers={"Authorization": "Bearer "+os.environ["SERVICE_AUTH_KEY"]})
    assert response.status_code == 200
    assert response.json()["inference_checked"] and response.json()["database_ready"]
    assert response.headers["cache-control"] == "private, no-store"


def test_consent_scope_nonce_replay_and_no_face_cannot_create_proof(client, principal):
    body = {**principal, "consent": True}
    assert client.post("/face/challenge", json=body).status_code == 401
    no_consent = client.post("/face/challenge", json={**body, "consent": False}, headers=headers(principal))
    assert no_consent.status_code == 400
    forged = client.post("/face/challenge", json={**body, "employee_id": "other"}, headers=headers(principal))
    assert forged.status_code == 403
    auth = headers(principal)
    response = client.post("/face/challenge", json=body, headers=auth)
    assert response.status_code == 200, response.text
    assert client.post("/face/challenge", json=body, headers=auth).status_code == 409
    challenge_id = response.json()["challenge_id"]
    _, encoded = cv2.imencode(".jpg", np.zeros((320, 320, 3), dtype=np.uint8))
    now = int(time.time()*1000)
    frames = [{"image": base64.b64encode(encoded).decode(), "captured_at": now+i*300} for i in range(5)]
    # Timestamp validity precedes detector invocation. Wait briefly to keep all frames in present.
    frames = [{**frame, "captured_at": now-800+i*200} for i, frame in enumerate(frames)]
    payload = {"challenge_id": challenge_id, "frames": frames, "employee_id": principal["employee_id"]}
    result = client.post("/face/enroll", json=payload, headers=headers(principal))
    assert result.json()["status"] == "NO_FACE", result.text
    assert client.post("/face/enroll", json=payload, headers=headers(principal)).status_code == 409
    with connect() as tx:
        assert tx.execute("SELECT count(*) AS n FROM face_verifications WHERE challenge_id=%s", (challenge_id,)).fetchone()["n"] == 0
        assert tx.execute("SELECT count(*) AS n FROM enrollment_consents WHERE actor_id=%s", (principal["actor_id"],)).fetchone()["n"] == 1


def test_session_revocation_and_client_liveness_flags_are_rejected(client, principal):
    with admin_connect() as tx: tx.execute("DELETE FROM sessions WHERE id=%s", (principal["session_id"],))
    response = client.post("/face/challenge", json={**principal, "consent": True}, headers=headers(principal))
    assert response.status_code == 403
    response = client.post("/face/verify", json={"challenge_id": "x", "frames": [], "isLive": True}, headers=headers(principal))
    assert response.status_code == 422 and "isLive" not in response.text


def test_capability_revocation_blocks_other_employee_enrollment(client, principal):
    with admin_connect() as tx:
        tx.execute("UPDATE users SET capabilities='{}' WHERE id=%s", (principal["actor_id"],))
    response = client.post("/face/challenge", json={**principal, "consent": True}, headers=headers(principal))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"
