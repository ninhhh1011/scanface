import base64
import hmac
import json
import os
import time

import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def b64(data):
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def unb64(data):
    return base64.b64decode(data + "=" * (-len(data) % 4), altchars=b"-_", validate=True)


def sign_scope(scope, key):
    payload = b64(json.dumps(scope, separators=(",", ":")).encode())
    return payload + "." + b64(hmac.digest(key.encode(), payload.encode(), "sha256"))


def verify_scope(token, key, expected):
    try:
        if len(token) > 4096 or len(key) < 32: raise ValueError()
        payload, signature = token.split(".")
        if not hmac.compare_digest(unb64(signature), hmac.digest(key.encode(), payload.encode(), "sha256")): raise ValueError()
        scope = json.loads(unb64(payload))
        if set(scope) != {"actor_id", "session_id", "employee_id", "action", "exp", "nonce"}: raise ValueError()
        if any(not isinstance(scope[k], str) or not 1 <= len(scope[k]) <= 200 for k in scope if k != "exp"): raise ValueError()
        now = time.time()
        if type(scope["exp"]) not in (float, int) or not now < scope["exp"] <= now + 90: raise ValueError()
        if any(scope.get(k) != v for k, v in expected.items()): raise ValueError()
        return scope
    except (ValueError, TypeError, KeyError, UnicodeError) as exc:
        raise ValueError("INVALID_SCOPE") from exc


def encryption_key():
    key = unb64(os.environ.get("FACE_ENCRYPTION_KEY", ""))
    if len(key) != 32: raise ValueError("FACE_ENCRYPTION_KEY_INVALID")
    return key


def encrypt_template(vector, key, employee_id, model):
    nonce = os.urandom(12)
    aad = json.dumps([employee_id, model, len(vector)], separators=(",", ":")).encode()
    return nonce + AESGCM(key).encrypt(nonce, np.asarray(vector, dtype="<f4").tobytes(), aad)


def decrypt_template(blob, key, employee_id, model, dimension):
    blob = bytes(blob)
    aad = json.dumps([employee_id, model, dimension], separators=(",", ":")).encode()
    plaintext = AESGCM(key).decrypt(blob[:12], blob[12:], aad)
    vector = np.frombuffer(plaintext, dtype="<f4").copy()
    if len(vector) != dimension or not np.isfinite(vector).all() or abs(np.linalg.norm(vector)-1) > .01:
        raise ValueError("INVALID_TEMPLATE")
    return vector
