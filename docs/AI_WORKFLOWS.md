# Knowledge and Copilot implementation

`apps/web/src/server/ai` contains the bounded workflow, schemas, provider, scoped tools and knowledge lifecycle. API handlers use the shared current session, origin/body guard and private no-store response wrapper. No runtime canned provider, vectors, SQL executor, write tool or arbitrary URL tool exists.

## Configuration and provider contract

Configure ignored `.env` and the deployed Worker secrets. `LLM_PROVIDER` and `EMBEDDING_PROVIDER` accept `openai` or an explicitly configured `openai-compatible` endpoint. Each needs `_BASE_URL` (API base including `/v1`), `_API_KEY`, `_MODEL`; embeddings also need `EMBEDDING_DIMENSION` matching the actual native model output. No default model or automatic provider/model substitution. HTTPS is required except local HTTP development endpoints.

The implementation uses native fetch for documented [Chat Completions](https://developers.openai.com/api/reference/resources/chat) JSON mode (`response_format`, non-streaming, `max_completion_tokens`, `store:false`) and the [Embeddings API](https://developers.openai.com/api/reference/resources/embeddings/methods/create) float response. Official pages reviewed 2026-09-13. A compatible endpoint must implement these exact fields; it is not assumed to share another provider's tool-calling dialect. Model access and Vietnamese retrieval quality require the real-provider gate. The application does not send a reduced `dimensions` parameter; configure the actual model dimension.

Missing key/model/base/provider returns `503 AI_NOT_CONFIGURED`. Provider errors/timeouts return explicit errors, with no paid model fallback. Each request has a 25-second timeout and 256KB response ceiling. Chat output is capped at 2000 completion tokens and validated as JSON before use.

## Flow and limits

1. Authenticate; derive current employee IDs from server policy; validate message (2000 characters), input markers and user rate limit (20 requests per 5 minutes).
2. Parse typed plan: POLICY / PERSONAL_HR / TEAM_HR / ATTENDANCE / LEAVE / CONTRACT / HR_ANALYTICS / MIXED / UNSUPPORTED. At most four allowlisted tools, strict args; no role, SQL, table, employeeIds or URL accepted.
3. Execute read-only tools under server scope. ORM selects fields explicitly. Each query transaction has a 5-second SQL statement timeout and 7-second transaction timeout, 30-row cap, 90-day maximum range and audited result counts. Aggregate counts come from the database or the complete scoped server-side set, never from a truncated LLM list.
4. For POLICY/MIXED, request a real query embedding; materialize one SQL ACL/current-version/effective-date/model/dimension set shared by lexical and cosine search. Reciprocal rank fusion returns at most six chunks of 3000 characters. Cosine cutoff 0.65 is a retrieval heuristic, not a calibrated confidence score; tune only with measured provider/corpus evaluation. No reranker or answer cache.
5. Send minimal projected evidence as untrusted data. Validate plain text, disallow HTML/remote links/resource syntax and sensitive markers. Reauthenticate and compare scope hash after generation. Validate each citation against retrieved IDs and re-read current source ACL before persistence/response.
6. Persist user-owned sanitized messages and transactional audit metadata. The server does not stream drafts. Browser cancellation aborts outbound calls, with cancellation checked before tool calls and persistence.

Tools: `get_my_profile`, `get_my_attendance`, `get_my_leave_balance`, `get_team_attendance`, `get_recent_attendance`, `get_pending_approvals`, `get_contract_expiries`, `get_face_enrollment_status`, `get_department_statistics`, `get_employee_allowed_profile`, `get_my_payroll`. Self tools enforce actor employee ID. Team aggregates require manager or HR-read authority. Payroll additionally requires payroll:read and only returns the actor's items. Face status selects employee ID/status only, never a biometric template. Recent attendance defaults to the past 30 days. Missing check-in requires a single date and removes approved leave and unscheduled employees. Result envelopes include timestamp, timezone, applicable date range, exact total and truncation flag.

Morning Brief uses the same employee scope and database counts. Provider failure produces `source:SYSTEM`, `label:Thống kê hệ thống` and real `statistics`; a validated model summary is `source:AI`. Scope is rechecked before either response.

## Knowledge lifecycle

HR with knowledge:write uploads TXT/MD/PDF/DOCX as a private file and creates version metadata plus a PostgreSQL job. Metadata validates role ACL independently of content. Python's durable worker extracts, chunks, embeds, then commits real chunks and READY atomically. Scan-only PDFs are explicitly unsupported without OCR. See Python worker documentation for extraction limits, retries/checkpoints and lease checks.

`GET/POST /api/knowledge`; `GET/PATCH/POST/DELETE /api/knowledge/{id}` (POST adds a new version); `POST .../{publish|deactivate|reindex}`. Publish/reindex accept `{version_id}`. Publish requires READY version/job, nonempty dimension-valid vector chunks and current effective dates. Reindex moves a published or inactive target to DRAFT before queuing. Deactivation clears the active version and cancels jobs. Deletion transactionally tombstones metadata/private file access, deactivates versions and removes chunks, then deletes the raw blobs. Storage failure returns HTTP202 `storage_cleanup_pending:true`; repeating DELETE on the same tombstoned ID retries cleanup. No historical version is silently treated as current policy.

`GET /api/knowledge/{id}/preview?version_id=...` returns up to 30 extracted chunks for knowledge managers before publish. `GET /api/knowledge/chunks/{id}` returns current accessible source text, real version, section/page (null where absent), and document/chunk IDs. Client must render source as text, never innerHTML. Confidential policy additionally requires documents:sensitive, even if roles are accidentally broad.

Seed: `node --env-file=.env scripts/kb-ingest-seed.mjs` logs in with ignored local HR credentials and uploads ten Vietnamese SEED policies through the normal multipart API. Existing titles are skipped. This queues jobs; it does not inject embeddings, mark READY or publish. After real indexing, HR previews and publishes explicitly.

## History and security limits

Permission hash includes actor, role/capabilities, sorted current employee scope, active permitted knowledge metadata and current version hashes. Any scope/ACL/effectivity change clears old messages before viewing or reuse. Only the last four user turns assist reference resolution; prior model answers/tool results never become new evidence. Session ownership is always rechecked, and deletions audit in transaction.

Security boundaries are current SQL scope, field selection, strict tool schemas and current citation authorization. Marker detection and instruction separation add protection; they are not a claim of complete prompt-injection prevention. Plain-text checks are deliberately conservative and can reject otherwise legitimate document text containing remote URLs or sensitive field names. Citation membership establishes provenance, not full semantic entailment; real model quality must be evaluated separately.
