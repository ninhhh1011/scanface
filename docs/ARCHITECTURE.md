# Architecture and compatibility decisions

2026-09-13. Workspace E:\scanface. Node 24.15.0, npm 11.12.1, Python system 3.14.4, Docker 29.5.3. Python service uses a project environment with a wheel-compatible Python version, not the system interpreter.

Verified local primary runtime: Next.js 16 App Router APIs on vinext 1.0.0-beta.9, Vite 8.3.0, @vinext/cloudflare 1.0.0-beta.7, Wrangler 4.131.1. React 19.3.0, HeroUI react/styles 3.2.5, Tailwind 4.3.3. Prisma client/CLI/adapter-pg 7.10.0 (stable; registry `prisma` default currently points at 8 RC, deliberately not selected). PostgreSQL 17 + pgvector. Cookie opaque server sessions and standard scrypt implementation, no homemade cryptography. DB uses Prisma JS client with pg driver adapter; Workers nodejs_compat. Transaction and vector-query proof required before runtime accepted.

vinext reimplements Next APIs; it is not `next build`. No cacheComponents/PPR, ISR or cross-user cached data. Pages and API use no-store. Font is self-hosted Inter Tight. Workers preview must prove runtime before adoption. OpenNext 1.20.6 supports installed Next version as fallback if a measured incompatibility arises; do not keep competing deploy configs.

Browser → same-origin authorized API → PostgreSQL HR services; Python service alone handles biometric inference/encrypted templates and document extraction/indexing. Private R2 binding in Workers preview/production; Python job worker retrieves authorized files through internal signed service requests. PostgreSQL queue survives process restarts. One migration owner. Text vectors never contain biometrics.

Design adaptation: source colors/font/radii map to HeroUI CSS semantic variables; 14px body, 44px controls, restrained accents, top navigation grouped with a visible mobile/tablet menu. HR workspace uses 24–40px gutters instead of marketing 180px.

Official sources read:
- https://github.com/heroui-inc/heroui (v3 README, compound components, no provider)
- https://heroui.com/en/docs/react/getting-started/quick-start (React19/Tailwind4, react + styles)
- https://heroui.com/en/docs/react/getting-started/theming (CSS variables/BEM)
- https://heroui.com/en/docs/react/components/text-field
- https://heroui.com/en/docs/react/components/select
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ (vinext recommended, beta)
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://raw.githubusercontent.com/cloudflare/vinext/main/README.md (known compatibility gaps)
- https://raw.githubusercontent.com/cloudflare/vinext/main/packages/cloudflare/README.md
- npm view package version/peerDependencies, actual selected packages in lockfile.

Compatibility status: IMPLEMENTED_AND_VERIFIED on local production Workers preview. Artifact `artifacts/verification/compatibility-smoke.json` proves real login/cookie/protected API, PostgreSQL transaction/vector query, private R2 upload/read/delete and outbound Python model readiness. Chat has verified 503 when configuration is absent; real provider response remains a separate gate.

Vite explicitly aliases `@prisma/client` to official `@prisma/client/edge`. Without this alias, development worked but production workerd rejected dynamically compiled Prisma WASM. The edge client plus PrismaPg resolves the production runtime mismatch. DB clients live per request through AsyncLocalStorage and disconnect afterward. Native models stay in Python.

Dependency audit fixes: Vitest4.1.11, tsx4.23.13; root overrides deepmerge-ts8.0.2 and mysql2 3.24.4 remove vulnerable Prisma CLI transitive versions. Prisma generate/typecheck/build and DB tests passed after overrides; npm audit reports zero current advisories. Python service pins CPython3.12.13 and its34 requirements.

Password hashes are versioned scrypt N=16384,r=8,p=5,32-byte output with random16-byte salts. Legacy local hashes are upgraded only after successful verification under a current-user transaction. No public login credentials. Opaque256-bit sessions are hashed in DB; role/password changes revoke sessions. AI uses restricted abc_ai SQL role. Web configuration excludes FACE_ENCRYPTION_KEY and AI_DATABASE_URL.

Business settings are strict schemas and feed services: early_checkin_minutes/max_session_hours, max_request_days and optional base salary proration (integer VND, standard_minutes). Default internal payroll is fixed base + allowance + explicitly reasoned adjustment; worked/approved-actual OT minutes are reported, OT pay requires an explicit salary component. It is not a statutory payroll/tax engine. No AI salary penalty. Individual Copilot payroll reads only LOCKED periods.

Known ceilings: vinext is beta and not the native Next runtime; global transaction locks target a small company. Recognition uses basic2D head motion, not certified anti-spoofing. External API availability, human capture accuracy and online cold starts remain unmeasured.

Windows Node finding: Node24.15.0 on Windows build26200 exited with native0xC0000409 in both Vitest fork/thread pools and later Vite preview, without a JavaScript exception. The same suite and preview passed with `node --no-maglev`; final suite63 tests passed/26 provider skips. Local npm entry points for tests, verification, browser scripts, setup/seed and vinext build/dev/preview/deploy apply this flag. This measured workaround matches [nodejs/node#62260](https://github.com/nodejs/node/issues/62260); the underlying native fault is not independently proven. It changes host Node optimization, not application authorization or workerd security. Retest before removing it or changing Node.
