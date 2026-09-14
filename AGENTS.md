# ABC HRM — continuation index

Read `docs/PROGRESS.md` first, then `MASTER_PROMPT_CODEX_HRM.md`, `PROMPT_CODEX_HEROUI_REVIEWS_MIGRATION.md` and the unchanged `reviews.io-design.md`. User explicitly authorizes continuous implementation, local installs/services/tests and small technical decisions. No commit/push, no public resources, no paid provisioning without authorization. This project is ALREADY implemented; continue existing code; never scaffold anew.

- Source of scope: master prompt; design source: `reviews.io-design.md` (SHA256 `f2e405a9bf15ff732b1834007c4c2f7e393514b5cfa6cb659031e1b9bcc41edb`). Replaces deprecated `getdesign.io-design.md`.
- Design system: HeroUI + Reviews.io (Teal `#067C74`, system-ui typography, rounded-full pills, clean SaaS cards, no black-pink-purple palette).
- Contracts: `docs/API_CONTRACTS.md`; architecture/version sources: `docs/ARCHITECTURE.md`.
- Root owns Prisma schema/migrations, root package/lock, auth/policies/HR API and integration. Parallel work must have disjoint ownership and may not overwrite another worker's changes.
- Never manufacture recognition, enrollment, liveness, RAG, persistence or test success. Initial employees NV001–NV020; no biometric seed. Synthetic business history uses `SEED` provenance.
- Mutations require current server session, origin validation, object/field authorization, validation and transactional audit. Copilot tools are read-only and scoped in SQL.
- Secrets live in ignored `.env`, `.dev.vars`, `.local/`; never print them. Frames/templates never enter logs or LLM context.
- Run root npm commands documented in README. Update PROGRESS after every phase, recording actual commands/evidence and remaining gaps. Never scaffold again over existing code.
