# ABC HRM implementation plan

Goal: implement all master-prompt scope with observable verification, not a frontend-only artifact.
Architecture: modular TypeScript HR monolith, Python face/document service, PostgreSQL/pgvector, private R2. Selected stack and sources in ARCHITECTURE.
User has authorized execution and minor design choices; no intermediate approval/commit steps.

- [ ] Phase 0: root creates AGENTS, contracts, schema and version locks; preserve design hash.
- [ ] Phase 1: root creates auth + protected API and shell; tests fail for missing auth/DB; implement; start real Postgres and Workers; verify cookie/login/read/write/transactions/vector/upload/internal readiness/chat HTTP path.
- [ ] Phase 2: root owns `prisma/`, `apps/web/src/server/`, API and seed. Test out-of-scope reads and exact idempotent seed, then implement employee/org/contract CRUD/import/export with transactional audit.
- [ ] Phase 3: same owner implements validated HR transitions and invariants; tests cover overnight shift, overlap, self-approval, ledger consistency, locked periods and integer money. UI owner builds actual forms linked to contracted APIs.
- [ ] Phase 4: Python owner implements `services/ai/` and model scripts/cards; actual pinned downloads/readiness, encrypted enrollment/re-enrollment/delete, inference, active challenge and one-use proof; root integrates transactional attendance and UI owner consent/camera. No fake identity in runtime.
- [ ] Phase 5: Copilot owner implements `apps/web/src/server/ai/`, scoped read-only tools, typed routing/provider adapter/retrieval/citations/history and 30-case evaluation. Python owner adds extraction/queue worker. Source metadata remains server-owned.
- [ ] Phase 6: review object/field checks, CSRF/revoke, replay/concurrency, file ACL, injections and transactional audit; fix and rerun targeted tests.
- [ ] Phase 7: real browser flow/viewport tests, typecheck/lint/unit/integration/build/Workers smoke, collect artifacts and resolve blockers.
- [ ] Phase 8: deployment configs/doctor and Windows README; online only after required credentials/authorization; human enrollment stays explicit.

Disjoint parallel ownership after contracts: root schema/auth/HR/infra; Python face+ingestion; UI client components; Copilot server AI. Each worker is required to report actual test commands/results and scope gaps. Root reviews and integrates; no agent may change schema or another owner's files without coordinating.
