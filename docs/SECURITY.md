# Security controls and verification

This is a bounded implementation and test record, not a claim of complete penetration testing or immunity to prompt injection. See `SECURITY_REVIEW.md` for the original seven findings and `USER_ACTIONS.md` for external verification gates. No biometric enrollment, provider output, or online security result is fabricated.

## Boundaries implemented

- Server-side opaque sessions are hashed in PostgreSQL. Cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Password changes, account locks and role changes revoke sessions. Mutating browser requests require the configured exact Origin; API responses are private/no-store. Write transactions recheck the current session and capabilities after obtaining the business lock.
- Shared policy functions derive employee scope from the authenticated account and current database manager relationships. Employees see self; managers see self/direct reports; explicit capabilities control HR, salary, identity documents, knowledge and system management. IDs supplied in a URL, query, form or tool call cannot expand this scope. Sensitive fields are projected on reads and mutation responses.
- HR writes validate strict schemas and use transactions with audit. Database uniqueness/exclusion constraints protect concurrent attendance, assignment, leave and OT operations. Timesheet/payroll locks protect calculations. The global HR transaction lock is intentionally sized for a small company; it is a throughput limit, not a distributed queue.
- Private files use R2 object storage and authenticated download endpoints. MIME/extension/signature and byte limits are enforced. A knowledge editing capability cannot read another owner's unattached private HR file or mutate an employee attachment without HR authority. File deletion and knowledge lifecycle cleanup are explicit; backup erasure is not asserted.
- Python requires bearer authentication plus a signed, expiring, single-use scoped envelope. Its separate PostgreSQL role cannot read password hashes/payroll or mutate users/HR/payroll. A fixed-search-path SQL scope function checks current session, employee and role without exposing credentials. Raw frames are transient; face templates use AES-GCM with employee/model/dimension as authenticated context.
- Face challenges require explicit consent and bind employee, actor, session, action, expiry and capture sequence. Model inference, quality, normalized matching and motion checks execute on the service. Attendance accepts only a persisted, unexpired, unconsumed verification for the current session/employee/action; proof consumption and the attendance event commit atomically. Browser `isLive` and identity claims have no authority.
- Copilot has eleven read-only tools, strict allowlisted arguments, bounded provider calls/results and SQL scopes. Retrieval checks current ACL, effective date and published version before lexical/vector search and again when opening a citation. History includes a permission fingerprint and is invalidated on scope changes. Tool/document text is untrusted data. Model output is validated before delivery; HTML and remote resources are refused. Regex attack detection is supplemental, never the authorization boundary.
- Login, chat, face and uploads have persisted limits. API bodies, images, files, parser execution, provider requests, tool count, date ranges and result counts are bounded. Logs/artifacts exclude credentials, raw frames and templates; audit records capture authorized actions and denial reasons.

## Evidence and repeatable commands

From the root after setup and with a current Workers preview:

```powershell
$env:RUN_AI_DB_TESTS='1'
npm test -- apps/web/tests/security-regression.test.ts apps/web/tests/hr-integration.test.ts apps/web/tests/ai-
$env:RUN_SECURITY_HTTP_TESTS='1'
npm test -- apps/web/tests/security-http.test.ts
services/ai/.venv/Scripts/python.exe services/ai/run-local.py test tests -q
```

The HTTP suite reads the ignored local credential file internally and writes only endpoint/method/status evidence to `artifacts/verification/security-http.json`. It tests real Workers requests, actual private storage and PostgreSQL; forged biometric proofs are rejection tests only. It creates one temporary private text file, deletes it through the authenticated API, and logs out its own sessions. It does not reset account rate limits or change any role/password.

Actual run at **2026-09-13 20:08 ICT**: the gated HTTP command above exited **0**, **1 test passed**, with **53 real HTTP requests**. Assertions covered anonymous access, foreign Origin/missing Origin, cross-employee/team attendance/contract salary/list/export/file access, no-store/nosniff headers, response field projection, fabricated repeated proof, forged identity/liveness flags, a body larger than 14MiB returning413, and logout followed by401 on reads/writes. Authorized R2 fixture download and cleanup returned200. Evidence: `artifacts/verification/security-http.json` and `.log`. An initial attempt failed in test setup because the SQL table was incorrectly named `employment_contracts`; inspection confirmed the migration uses `contracts`, and the corrected test passed. No application fix was needed for that failure. A prior no-flag run intentionally skipped the test; skipped is not PASS.

Existing measured evidence: real PostgreSQL scope/concurrency/leave ledger and six initial review regressions passed; the consolidated run recorded 45 passed/27 explicitly skipped before later additions. Python's 17 tests passed using restricted DB credentials, including real blank-image inference and nonce/challenge/session negatives. Separate Workers Copilot HTTP verification passed for anonymous denial, ten durable document entries, premature publication denial and missing-provider behavior. Exact later counts belong in `PROGRESS.md` and test artifacts rather than inferred totals here.

The initial seven findings have source-level fixes: shared response projection; transactional session revalidation; restricted AI DB role; payroll invalidation/revalidation; document authority separation; overnight/stale OT validation; reasoned contract termination. Regression coverage is in `security-regression.test.ts`, HR tests and Python tests. Source inspection alone does not prove every concurrency interleaving.

Additional real PostgreSQL lifecycle verification at **20:19 ICT**: `npm test -- apps/web/tests/workflow-lifecycle.test.ts --pool=threads --reporter=dot` exited0, **five tests passed**. It exercises missing-checkout rejection/correction/audit; locked timesheet writes and payroll lock/reopen invalidation; own scoped timesheet and salary details; locked-only Copilot payroll; private unpublished assessments and forged employee score denial; schedule changes rejected at both OT submit and approval; reasoned entitlement changes with below-used/immutable-year/employee-denial checks; notification ownership and persisted-session revocation after user role change. Temporary business records were removed and20 employees/zero lifecycle fixtures verified. Service actors are explicit test fixtures; this supplements the real HTTP authentication suite rather than substituting for browser tests.

This run exposed a real generic CSV bug: Prisma Decimal values were filtered out as objects, omitting salary-component amounts. The shared export scalar filter was fixed, and the lifecycle regression now verifies retained amounts plus unauthorized contract salary projection. Earlier fork-pool attempts exited mid-test without assertion output; exact interrupted fixtures were inspected and removed, then the thread-pool run completed. No unsupported memory/process root cause is claimed. See the lifecycle log for the successful command; root consolidated verification records subsequent changes.

## Attack coverage and remaining gates

| Attack / boundary | Existing check | Limit |
|---|---|---|
| Anonymous API, CSRF, cross-employee/team object/list/export/download | Actual Workers `security-http.test.ts`; scoped DB tests | Run flag required; artifact reports actual outcome |
| Password/storage/template field leakage | Shared projection regression and HTTP recursive key checks | Key checks are not a semantic DLP guarantee |
| Forged role/employee IDs in tool arguments, direct secrets/instruction request, fabricated citation and HTML/remote link | `ai-guards`, `ai-api`, `ai-scope`, `ai-eval` tests | Fake provider tests verify code contracts, not model behavior |
| Aggregate scope, revoked history, inactive/private sources | Actual PostgreSQL AI tests | Real embedded-document retrieval/citation gates still need provider configuration |
| Indirect injection in policy/tool text and encoded requests | Untrusted evidence separation/output guards; test cases | Full real-provider adversarial evaluation has not run; no 100% prevention claim |
| Forged/repeated/expired face proof, `isLive`, revoked profile/session, nonce/challenge replay | Web rejection tests and Python DB/protocol tests | No successful human proof replay or face accuracy test yet |
| AI process reads/mutates unrelated tables | Actual restricted-role negative tests | Production grants/cloud identity still require deployment verification |
| Missing embedding provider | Ten real jobs failed after three attempts; zero chunks | Confirms failure/retry handling, not indexing |

Basic 2D head movement is not certified presentation-attack detection; replay/deepfake spoof resistance and human recognition thresholds require representative participants and devices. Online HTTPS/cookie/CORS, storage privacy, credential rotation, backup recovery and persistence across redeploy are pending deployment checks. Configure a trusted provider and complete the explicit real-provider tests before enabling broad Copilot use with sensitive live data.

## Final consolidated verification — 20:47 ICT

`npm run verify -- --http` exited2 PENDING_ACCEPTANCE, with all executed local suites exit0:63 TypeScript tests passed/26 provider tests skipped;17 Python tests passed;53 actual HTTP requests in the security suite;27 browser checks/12 business flows; lint/typecheck/runtime/secrets/doctor passed. Dependency audit remains0 vulnerabilities. The five LIFE tests passed within this root run. The secret scanner checked119 files with0 findings; real secrets are never included in reports. See `artifacts/verification/verify.json` and named logs.

The earlier thread-pool success was an intermediate observation. Subsequent native Windows crashes also affected Vite preview; Node `--no-maglev` stabilized measured test/runtime runs. This is documented with its limits in ARCHITECTURE. A separate browser login timeout was retained as prior failure evidence; the final aggregate browser run passed after adding redacted error/HTTP-status diagnostics. No definitive cause is assigned to that timeout, and authentication rate limits were not reset or weakened.
