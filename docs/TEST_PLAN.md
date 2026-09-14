# Test plan and acceptance gates

Nguồn bằng chứng là log/JSON có timestamp trong `artifacts/verification`, và PROGRESS cập nhật sau phase. Một suite chạy thành công không biến các test skip thành PASS. `node scripts/verify.mjs` exit1 khi failure, exit2 khi còn gate; không suy diễn chất lượng nhận diện từ health/model checksum.

| Nhóm | Lệnh/bằng chứng | Điều kiện |
|---|---|---|
| Static/build | npm run lint; npm run typecheck; npm run build | Dừng preview trước build trên Windows |
| Domain/security/DB | npm test; RUN_AI_DB_TESTS=1 | PostgreSQL local đã migrate/seed; không chạy trên production |
| Python models/protocol/queue | npm run test:ai | Python3.12 venv, models thật, local DB/role; pytest có fixtures chỉ dùng trong tests |
| Workers runtime | node --env-file=.env scripts/smoke.mjs | Production preview + Python; thật cookie/transaction/vector/R2 roundtrip/authorization; provider thiếu phải trả503 |
| Browser | npm run test:e2e | Chrome, server3000; role scopes, routes,390/768/1024/1440 viewports; artifact screenshots |
| Copilot provider eval | npm run verify -- --http --providers | Có API/model/key và chấp thuận chi phí; không tính unit mock là RAG thật |
| Human biometric | USER_ACTIONS + MODEL_CARD | Ba người consent, enrollment9frames, người lạ consent, ánh sáng/góc/khoảng cách khác nhau |
| Online | DEPLOYMENT runbook | Credential/billing/HTTPS thật; không dùng localhost thay public evidence |

## Cases bắt buộc

Auth: unauth401, role/object/field403, origin khác bị chặn, session revoke khi khóa tài khoản/đổi quyền/password, audit denied và mutate, rate limit. Kiểm tra response không chứa hash/secret/base salary không đúng quyền. Tài liệu private phải bị từ chối khi user không có scope dù biết ID; knowledge permission không tự thành quyền sửa hồ sơ HR.

Nghiệp vụ: CSV preview trước commit, unique employee code, direct manager scope; lịch chồng lấn/ca qua đêm; leave approve/cancel ledger đúng một lần; OT không chồng regular shift; correction có lý do/trước-sau; bảng công khóa chặn sửa, mở lại vô hiệu bảng lương chưa khóa; salary/currency dùng integer, payroll items cập nhật đúng source. Concurrency dùng DB constraints/transactions, test retry không tạo attendance hoặc ledger đôi.

Face: model files/checksum/version/dimension thật, không face/multiple/blur/dark, request thiếu/giả service token, nonce replay, challenge hết hạn/sai actor/action, session revoked, client không tự khẳng định `isLive` hoặc employee ID cho commit, proof one-use/expiry/session/action/profile binding, duplicate enrollee, delete templates/proofs, no frame persistence. Synthetic frame chỉ chứng minh rejection/plumbing; không được báo accuracy/liveness PASS. Sau consent cần từng NV001–003 enrollee scan mới, unknown person, ảnh in/replay video, retry, explicit check-in/out và audit; đo false accept/reject và giới hạn basic liveness.

RAG: upload10 file thật, parser và durable job, fail/retry, unconfigured provider fail rõ, không publish chưa READY; ACL/effective date/version trước semantic+lexical và khi mở citation; unknown citation bị chặn; tool scopes enforced SQL; prompt injection trong tài liệu không được nâng quyền hoặc gọi write; history bị re-evaluate khi đổi quyền; nguồn không đủ trả lời hạn chế đúng chứng cứ. LLM/embedding thật phải qua explicit provider suite và lưu kết quả, không lấy unit mock làm bằng chứng.

UI: đăng nhập4role, điều hướng keyboard/focus/dialog, validation/error/retry/empty/loading, CRUD đến persistence, table scroll không tràn viewport, consent/camera-denied UX, stop/retry chat và citation opening. Acceptance online kiểm tra cookie HTTPS, private R2 và model/queue cùng tồn tại sau restart/redeploy.

## Hiện trạng cần giữ trung thực

Các module có check tự động trong apps/web/tests và services/ai/tests. Các báo cáo UI_VERIFICATION, PYTHON_VERIFICATION, AI_VERIFICATION, SECURITY_REVIEW ghi kết quả theo thời điểm riêng. Human enrollment và accuracy chưa chạy; real LLM/embedding/RAG chưa chạy khi thiếu provider; production cloud chưa deploy. Dữ liệu20employee và policy seed không phải bằng chứng recognition hay indexing thành công.
