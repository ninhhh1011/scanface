# Báo cáo kết thúc phiên — 2026-09-13, 20:47 ICT

ABC HRM chạy tại **http://127.0.0.1:3000** bằng production Workers preview. Trạng thái chung **PENDING_ACCEPTANCE**. Chưa có URL online. Source nghiệp vụ, persistence, authorization, audit, face service và Copilot đã triển khai; các gate người thật/provider/cloud vẫn mở.

## Runtime và cấu trúc

Node24.15.0; React19.3.0; Next16.3.5 App Router APIs trên vinext1.0.0-beta.9/Vite8.3.0; HeroUI3.2.5/Tailwind4.3.3; Prisma7.10.0/PostgreSQL17+pgvector; Wrangler4.131.1/R2 private; CPython3.12.13/FastAPI0.141.1/OpenCV4.12.0.88. Đây là vinext runtime, không phải native `next build`.

`apps/web` chứa UI/API/authorization/HR/Copilot; `prisma` chứa schema/4 migrations/seed; `services/ai` chứa inference, encrypted templates và durable ingestion; `infra` chứa Docker/Render/Workers setup; `scripts` chứa setup/services/verification; `docs` chứa contracts/runbooks/evidence index.

## Bằng chứng thực chạy

| Lệnh / kiểm tra | Exit | Kết quả / artifact |
|---|---:|---|
| `npm run verify -- --http` | 2 | PENDING_ACCEPTANCE; không có FAIL; `artifacts/verification/verify.json` |
| `npm run lint`, `npm run typecheck` trong verify | 0 mỗi lệnh | PASS; verify-lint.log / verify-typecheck.log |
| `npm test -- --reporter=dot`, bật DB/HTTP flags qua verify | 0 | 63 passed,26 provider/RAG skipped; verify-tests.log |
| `npm run test:ai` / cùng Python command trong verify | 0 | 17 passed,2 upstream deprecation warnings; verify-python.log |
| `npm run build` | 0 | Production build; build.log. Chạy riêng trước khi mở preview, không build lại trong aggregate |
| runtime smoke / browser QA / browser flows qua verify | 0 mỗi script | 10 runtime checks;27 UI checks;12 flows,0 page errors; verify-runtime/browser/browser-flows logs |
| `node scripts/fresh-setup-check.mjs` | 0 | 4 migrations; seed20/0 profiles/0 templates/1 incomplete checkout; reseed giữ edit; temporary DB đã dọn; fresh-setup.json |
| `npm audit --json`, `npm run security:secrets` | 0 mỗi lệnh | 0 vulnerabilities; kiểm tra lại sau cập nhật docs lúc20:50 ICT:120 files/0 secret findings; npm-audit.json / secret-check.json |
| `npm run services:status` | 0 | AI/jobs/web RUNNING; ports3000/8000/54329 LISTENING |
| `npm run deploy:check` | 2 | Thiếu cấu hình production/cloud; deploy-check.json |
| `npm run deploy:web -- --dry-run` | 0 | Không build/deploy/provision; deploy-dry-run.log |
| Online HTTPS / real provider / human face acceptance | NOT_RUN | Chưa đủ điều kiện; không báo PASS |

HTTP security suite kiểm tra53 request thật; service lifecycle suite có5 tests. Browser đã kiểm tra4 vai trò/4 viewport và các luồng nhân viên, phân ca, hợp đồng/private file, định mức phép, bảng công CSV, duyệt/hủy phép. `FEATURE_MATRIX.md` phân biệt từng route/API/policy/evidence và các nhánh UI chưa chạy riêng. Một lần browser timeout được lưu ở verify-prior-failure.json; lần cuối đã qua, nguyên nhân lần trước chưa xác nhận.

## Dữ liệu và phần cần người dùng

Đúng20 nhân viên NV001–NV020, dữ liệu nghiệp vụ mẫu có provenance SEED. **0 enrolled profiles,0 templates**; NV001–NV003 chưa enrollment. Hai model thật YuNet/SFace đã tải và kiểm checksum/inference.10 policy files private;10 jobs FAILED sau3 lần thử vì EMBEDDINGS_NOT_CONFIGURED;0 chunks. Không có embedding giả hoặc real-provider success giả.

Điền LLM_PROVIDER/BASE_URL/API_KEY/MODEL và EMBEDDING_PROVIDER/BASE_URL/API_KEY/MODEL/DIMENSION trong `.env`; xác nhận chi phí trước real-provider tests. Cần3 người đồng ý enrollment/capture mới và người chưa đăng ký đồng ý kiểm tra unknown. Cloud cần tài khoản Cloudflare, PostgreSQL/pgvector, R2 private và host Python API/worker, kèm quyền/cost approval. Các bước cụ thể ở `USER_ACTIONS.md`.

## Chạy lại và giới hạn

PowerShell tại `E:\scanface`: `npm run services:start -- -WebMode preview`; kiểm tra `npm run services:status`; dừng `npm run services:stop`. DB volume được giữ; `npm run infra:down` dừng DB, không dùng `down -v`. Trước build: dừng services, `npm run build`, khởi động preview lại. Credential ngẫu nhiên cho4 tài khoản local nằm trong `.local/credentials.json`, không công bố mật khẩu. Fresh-install instructions ở README.

Basic2D liveness chưa được chứng minh chống video/deepfake; độ chính xác nhận diện chưa đo trên người thật. vinext còn beta; local Node có workaround `--no-maglev` cho native crash đã quan sát. Lương là quản trị nội bộ, không khai thuế/chuyển tiền. Provider/RAG quality, online HTTPS và persistence qua cloud redeploy chưa kiểm tra. Local restart/storage/DB đã có evidence nhưng không thay thế cloud acceptance.

Điểm tiếp tục: `PROGRESS.md`, cùng `FEATURE_MATRIX.md` và `USER_ACTIONS.md`. Design SHA256 vẫn `688D868501F47A5A7EB24F4D1C4090322D0FA0D66875D8AD6E15AF6D6174926E`. Không commit/push, không tạo public resources hoặc paid provisioning.
