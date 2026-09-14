# Copilot verification — 2026-09-13

Implemented: bounded provider adapters, 11 read-only scoped tools, knowledge metadata/jobs/version actions/current ACL retrieval/source preview, scoped chat history and system-statistics fallback. Real provider and embeddings remain NEEDS_CONFIGURATION; no real retrieval/answer quality score is claimed.

## Executed evidence

- Initial new guard/tool/knowledge suites failed because implementations were absent; then passed after implementation.
- `npm run typecheck`: exit 0 after concurrent root/UI files were completed (2026-09-13 19:25 local).
- `$env:RUN_AI_DB_TESTS='1'; npm test -- apps/web/tests/ai-guards.test.ts apps/web/tests/ai-scope.test.ts apps/web/tests/ai-knowledge.test.ts apps/web/tests/ai-provider.test.ts apps/web/tests/ai-integration.test.ts apps/web/tests/ai-api.test.ts apps/web/tests/ai-eval.test.ts`: exit 0; **28 passed, 25 skipped**, 7 files (2026-09-13 19:27 local).
- Real PostgreSQL checks execute every tool against the migration, confirm own profile, manager object exclusion, actual enrollment counts, scope hash changes, unauthorized sources/sessions, revoked-history clearing, direct API authentication/origin, employee upload denial, and explicit missing-provider/system-brief behavior.
- Fake provider/DB tests are named as such. They verify request bounds, malformed/truncated output, wrong/zero vector dimensions, tool allowlists, role/employeeIds argument injection, cross-user requests, citation fabrication, required citation IDs, direct secret/instruction requests, and HTML/remote-resource rejection. They do not establish model quality, real embeddings or resistance to all indirect attacks.
- `node --env-file=.env scripts/kb-ingest-seed.mjs`: initial attempt exit 1, login HTTP500 while root preview body wrapper was being repaired. No upload claimed for that attempt. Rerun status is recorded below when runtime is restored.
- `npm test -- apps/web/tests/ai-` with `RUN_AI_DB_TESTS=1`: exit0,28 passed/26 skipped across8 files at19:30. The extra skipped case is the explicit real RAG gate.
- `npm test -- apps/web/tests/ai-knowledge-db.test.ts` with `RUN_AI_DB_TESTS=1`: exit0,1 passed at19:34. Real DB lifecycle test with explicitly fake storage fixture (no vectors): refuses premature publish, reindexes inactive document to DRAFT, cancels job, revokes private file access, returns pending storage cleanup and succeeds on retry. Transient test records are removed.
- A regression test demonstrated missing effective date null was coerced to1970; strict ISO/date validation fixed it and the suite passed again. KB entry guard now checks mutation capability before parsing multipart, preventing malformed employee upload from becoming HTTP500.
- Final sequential DB/unit run: `$env:RUN_AI_DB_TESTS='1'; npm test -- apps/web/tests/ai- --no-file-parallelism`, exit0, **29 passed / 27 skipped**, 8 passed files/2 skipped files at19:39. The27 skipped cases are25 real routing,1 real RAG,1 separately gated Workers HTTP test. A preceding parallel run hit two default5-second integration deadlines during concurrent builds; integration deadlines now cover complete multi-query flows, and sequential execution passed.
- Workers gate separately: `$env:RUN_AI_HTTP_TESTS='1'; npm test -- apps/web/tests/ai-workers.test.ts`, exit0, **1 passed** at19:36. Actual requests verified anonymous chat401, HR login200, private knowledge list200 with ten policies, premature publish409, unconfigured chat503, system brief200 and missing source404. Artifact: `artifacts/verification/ai-workers-smoke.json`.
- Seed upload rerun on restored Workers: `node --env-file=.env scripts/kb-ingest-seed.mjs`, exit0, **10 uploaded**, artifact `artifacts/verification/kb-seed-upload.json`; all were queued, none automatically published.
- Final consolidated root run at20:47 ICT: lint/typecheck exit0;63 TypeScript tests passed/26 real-provider tests skipped, including actual AI DB and Workers HTTP checks. There are no remaining local lint/typecheck failures. Evidence: `artifacts/verification/verify.json` and `verify-tests.log`.
- Actual ingestion state after worker consumption: ten jobs FAILED with `EMBEDDINGS_NOT_CONFIGURED`, zero document chunks. These are explicit configuration failures, not indexed documents. A timed-out test left one identifiable test-only metadata fixture; its exact title/storage key were verified and it was removed. Fixture creation is now transactional inside cleanup scope.

## Explicit gates

`apps/web/tests/ai-eval.test.ts` contains 30 Vietnamese cases: policy, structured, mixed, unsupported/write/history and direct attacks. Five attack guards execute without a provider; 25 real routing cases are skipped unless `RUN_AI_PROVIDER_TESTS=1` and real LLM key/model are present. Dataset size is coverage, not accuracy.

`apps/web/tests/ai-real-rag.test.ts` is the real end-to-end gate: requires real provider/embedding configuration and at least one genuinely indexed and published policy, calls the production workflow, and opens every returned citation under the same current account. It never installs fake vectors or declares success on missing configuration.

Run the full AI suite using `npm test -- apps/web/tests/ai-`; set `RUN_AI_DB_TESTS=1` for migrated local DB checks and set `RUN_AI_PROVIDER_TESTS=1` only after the explicitly configured account/model is ready to incur provider usage. No secrets belong in the command line or reports.

Remaining gates: real embedding indexing, real RAG/provider evaluation, effective/version/ACL retrieval negatives with genuinely embedded fixture documents, full indirect injection evaluation, real-provider browser conversation/source-link flows. Workers preview HTTP smoke has passed. Blob cleanup retries are explicit; immediate backup erasure is not claimed. No online deployment, paid provisioning, commit or push performed.
