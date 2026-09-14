# Python subsystem verification

Date: 2026-09-13. Ownership: `services/ai/**`, `scripts/models-download.py`, model/notices/this document. Root owns all SQL migrations and integration.

Actual commands and results:

| Command from repository root | Result |
|---|---|
| `uv venv --python 3.12 services/ai/.venv` | Exit 0; CPython 3.12.13 |
| `uv pip compile services/ai/requirements.in --output-file services/ai/requirements.txt` | Exit 0; 34 pinned packages |
| `uv pip sync --python services/ai/.venv/Scripts/python.exe services/ai/requirements.txt` | Exit 0; installation completed; cross-volume hardlink fallback used copies |
| `services/ai/.venv/Scripts/python.exe scripts/models-download.py` | Exit 0; both actual ONNX binaries match official SHA-256 and sizes |
| `services/ai/.venv/Scripts/python.exe services/ai/run-local.py test tests -q` | 17 passed, exit 0, runtime using restricted `abc_ai`; 2 upstream test-client deprecation warnings (Starlette HTTPX and AnyIO alias) |
| `services/ai/.venv/Scripts/python.exe services/ai/run-local.py` | Live service on http://127.0.0.1:8000 |
| Bearer-authenticated `/readyz` | HTTP 200; model inference, PostgreSQL, AES key readiness true; dimension 128 |
| `docker build -f services/ai/Dockerfile -t abc-hrm-ai:local .` | Exit 0; Linux Python 3.12.13 image, installed dependencies and verified both model binaries |
| `docker run --rm abc-hrm-ai:local python -c "from app.face import FaceEngine; from app.worker import bounded_extract; ..."` | Exit 0; real Linux model inference dimension128 and bounded parser subprocess produced one Markdown chunk |

Tests are classified honestly:

- Real inference: both ONNX models execute; a generated blank JPEG produces NO_FACE. This is not an accuracy/liveness test.
- Synthetic algorithm/protocol unit tests: cosine unknown/ambiguity/identity grouping; active motion ordering/direction/timing; AES-GCM roundtrip/tamper/context; scope signature/expiry/binding; JPEG limits; text/Markdown/DOCX extraction; blank PDF scan rejection; embedding schema/dimension/NaN rejection. Synthetic vectors in these tests remain in memory and are not seeded or persisted as identities.
- Real FastAPI/PostgreSQL integration: readiness, explicit consent, unauthenticated/forged scope, durable nonce replay, consumed challenge replay, revoked session, client liveness flag refusal, real blank-frame rejection and no proof. Tests create temporary principals/challenge consent records and clean only their own records.
- Real PostgreSQL worker failure integration: durable job attempts 1–3, bounded retries, missing provider error, FAILED on last attempt and zero chunks. Bounded parser subprocess executes. No fake embedding provider is installed in runtime.
- Database privilege regression: production fails closed without AI_DATABASE_URL; actual `abc_ai` connection cannot read user password hashes/payroll or update employees/users/payroll/document ACLs/version file references. Test fixtures alone use the explicit owner connection in `tests/conftest.py`; handlers/worker retain restricted credentials. Current role/capability revocation is enforced through `public.face_session_scope`.

Restricted worker live evidence after the web uploaded ten policy files: all 10 ingestion jobs reached FAILED after exactly 3 attempts with `EMBEDDINGS_NOT_CONFIGURED`; the actual document_chunks count is 0 and 30 transactional failure audit events exist. This confirms durable failure handling, not successful indexing. After configuring the real provider, use the normal Reindex action to reset attempts and queue those versions. Persistent worker launched with `services/ai/.venv/Scripts/python.exe services/ai/run-local.py worker` (tool session 78656); API uses port8000 (PID16504, tool session3949 at this verification).

One failing verification exposed Windows multiprocessing re-importing the local launcher and recursively invoking tests. The launcher now uses the standard `if __name__ == '__main__'` guard; the full suite passed after that fix. Initial tests failed with missing app imports before implementation. Evidence does not claim every later-added integration test preceded implementation.

Implemented face path: authenticated service bearer + signed scope + persistent nonce; current SQL session/user/employee check through the restricted SECURITY DEFINER scope function; consent/challenge TTL; one active challenge per session; six challenges/minute; decode/quality/alignment/normalized inference; pairwise sample consistency; duplicate/unknown/ambiguity; atomic encrypted replacement; 30s single-use persisted verification bound to employee/session/action/challenge; delete invalidates in-flight challenges/proofs and audits. Other-employee enrollment/deletion requires current SUPER_ADMIN or hr:write capability; self-service scans remain employee bound. Global PostgreSQL advisory lock 734901 serializes profile changes/proof issuance. Web attendance consumption must coordinate with the same lock and transactionally consume proof with event creation.

Implemented ingestion: bounded private file fetch via internal fixed endpoint; TXT/MD/PDF text/DOCX extraction; section/page-aware chunks (1200 chars,150 overlap); durable PostgreSQL SKIP LOCKED claim/5min lease/3 attempts; JSONB extraction/real-vector checkpoints; configured `/embeddings` HTTP adapter; atomic chunk replacement + READY + audit. Query ACL/lexical/vector retrieval is owned by the web service; stored metadata supports both branches. Job readiness alone does not publish a document. Linux parser subprocess has 768MiB address-space cap and 30s deadline; Windows enforces deadline/file/ZIP/page/text bounds but does not impose a process address-space limit.

Remaining gates:

- **NEEDS_HUMAN_ENROLLMENT:** no real participants/camera testing; enroll NV001–NV003 explicitly, use new scans, verify unknown/multiple faces/lighting/head turn/manual fallback/re-enroll/delete and persisted attendance. Do not infer these results from synthetic tests.
- **NEEDS_CONFIGURATION:** embedding provider environment is absent; no real provider embedding/index/retrieval success claimed. Set EMBEDDING_BASE_URL (including `/v1` where applicable), EMBEDDING_API_KEY, EMBEDDING_MODEL and EMBEDDING_DIMENSION. API follows OpenAI-compatible `POST /embeddings`, float encoding and configured dimensions; model/provider must actually support that request.
- `APP_ENV=production` requires AI_DATABASE_URL and cannot fall back to DATABASE_URL. Local setup now provisions restricted `abc_ai`, which the verified API and worker both use. PostgreSQL, HTTPS service boundary and configured secrets remain production requirements. Local launcher reads ignored root `.env`, never prints it. Production container uses injected env only.
- Docker image build and Linux inference/parser smoke passed. Web-to-Python face UI/human flows are tracked separately; no online deployment claim.

Run service: `services/ai/.venv/Scripts/python.exe services/ai/run-local.py`.
Run durable worker: `services/ai/.venv/Scripts/python.exe services/ai/run-local.py worker` (or `worker --once`).
Container worker command: `python -m app.worker` with the same image and injected private env.
Tests that require PostgreSQL skip when no database env exists; the verified local run loaded real root `.env` and did not skip those checks.
