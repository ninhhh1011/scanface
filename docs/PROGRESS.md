# ABC HRM — tiếp tục tại đây

2026-09-14: theo yêu cầu trực tiếp của người dùng, đã chuyển mật khẩu cả 4 tài khoản mẫu (admin/hr/manager/employee) trong PostgreSQL local và `.local/credentials.json` về "1", thu hồi toàn bộ session cũ và làm mới rate limits. Kiểm tra HTTP login và verifyPassword cho cả 4 tài khoản đều đạt HTTP 200 { ok: true }.

### Cấu hình hiện hành & Kết quả kiểm chứng — 2026-09-14

Theo chỉ đạo của người dùng:
1. **Thứ tự triển khai được điều chỉnh: Face Enrollment là bước cuối cùng.** Mọi module khác, kiểm thử tự động, AI API thật và kiểm chứng quy trình đã hoàn thiện 100% trước khi yêu cầu người dùng quét mặt thật.
2. **AI Provider thực tế đã kiểm chứng thành công**:
   - LLM: OpenAI (`gpt-4.1-mini`), base URL `https://api.openai.com/v1`
   - Embeddings: Google Gemini (`gemini-embedding-001`, dimension 3072), base URL `https://generativelanguage.googleapis.com/v1beta/openai`
   - Toàn bộ 10 tài liệu chính sách nội bộ đã được băm nhỏ thành 40 chunks với vector 3072 dim trong pgvector và chuyển trạng thái `ACTIVE`.
   - `apps/web/tests/ai-eval.test.ts`: **26/26 passed** (100% đánh giá routing, tool calling, bảo mật prompt injection, HR domain questions với OpenAI API thực).
   - `apps/web/tests/ai-real-rag.test.ts`: **PASSED** (truy vấn embedding Gemini thực + sinh câu trả lời có trích dẫn chính sách nội bộ với OpenAI).
3. **Quy trình tổng kiểm chứng `npm run verify -- --http --providers`**: **PENDING_ACCEPTANCE** (chỉ còn 2 gate chờ chấp thuận là `human_face_acceptance` và `online_deployment`):
   - `lint`: **PASS** (0 warnings, 0 errors)
   - `typecheck`: **PASS** (tsc exit code 0)
   - `tests`: **PASS** (**89/89 passed**, 18 test files, 0 failed, 0 skipped)
   - `secrets`: **PASS** (121 files, 0 secret findings)
   - `python`: **PASS** (17/17 tests passed)
   - `runtime`: **PASS** (Workers preview HTTP slice & session)
   - `browser`: **PASS** (27 checks passed, 0 page errors)
   - `browser-flows`: **PASS** (12 business flows passed, 0 page errors, cleanup 20 seed employees preserved)
   - `doctor`: **PASS** (exit code 0, status CORE_READY_WITH_PENDING_GATES)

| Phase | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| 0 — Audit/contracts | DONE | Master prompt, PRD, API_CONTRACTS, version pins; design nguồn duy nhất `reviews.io-design.md` SHA256 `f2e405a9bf15ff732b1834007c4c2f7e393514b5cfa6cb659031e1b9bcc41edb` (đã xóa tệp cũ getdesign.io). |
| 1 — Compatibility | DONE local | Workers preview HTTP, session, PostgreSQL transaction/vector, R2 private storage, Python YuNet+SFace readiness. |
| 2 — Core HR/seed | DONE | PostgreSQL sạch: đúng 20 nhân viên NV001–NV020, 0 biometric seed; RBAC 4 vai trò (admin, hr, manager, employee). |
| 3 — Workflows | DONE | 5 lifecycle tests DB thật, 12 browser flows E2E (phòng ban, nhân viên, phân ca, hợp đồng, tệp đính kèm private, định mức phép, bảng công CSV, nghỉ phép). |
| 4 — Face | READY FOR ENROLLMENT | Mã nguồn, UI webcam, challenge liveness 2D, backend Python (YuNet + SFace) và test 17/17 đã hoàn thiện; sẵn sàng cho bước cuối: thu thập khuôn mặt thật NV001–NV003. |
| 5 — Knowledge/Copilot | DONE / VERIFIED | 10 văn bản chính sách (40 chunks) trong pgvector; OpenAI `gpt-4.1-mini` + Gemini Embeddings 3072; 26/26 eval tests + 1 RAG test thật PASSED. |
| 6 — Security | DONE | 53 security HTTP checks, CSRF, origin check, credential rotation, no secrets in logs, zero leak findings. |
| 7 — Polish/validation | DONE | `npm run verify -- --http --providers` exit code 0 cho toàn bộ test, lint, typecheck, secrets, python, runtime, browser, flows, doctor. |
| 8 — Online | DEPLOYING (CLOUDFLARE) | Đã cấu hình Cloudflare Workers CI/CD tự động: tên Worker `scanface`, fallback DB URL cho Prisma generate, bỏ bắt buộc R2 để triển khai 100% free; commit `4136840` đẩy lên GitHub `main`. |
| 9 — UI Migration | DONE | Đã hoàn tất di chuyển toàn bộ frontend sang **HeroUI + Reviews.io Design System** (Teal `#067C74`, card 22px, button pill 9999px, font `system-ui`). Xem chi tiết `docs/UI_MIGRATION_REPORT.md`. |

### Bước kế tiếp — Đăng ký khuôn mặt (Face Enrollment)
Hệ thống hiện đã sẵn sàng hoàn toàn ở trạng thái **CORE_READY_WITH_PENDING_GATES**.
Bước tiếp theo duy nhất cần sự phối hợp thực tế của người dùng trước khi deploy online là:
- Mở webcam trên trình duyệt tại `http://127.0.0.1:3000` để thực hiện Face Enrollment cho các nhân viên mẫu NV001–NV003 theo hướng dẫn trong `docs/USER_ACTIONS.md`.

