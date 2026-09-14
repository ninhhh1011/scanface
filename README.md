# ABC HRM

Ứng dụng HRM tiếng Việt: HR, chấm công, nghỉ phép, OT, bảng công/lương nội bộ, đánh giá, tài liệu, phân quyền/audit; Python YuNet/SFace xử lý khuôn mặt và worker PostgreSQL xử lý tài liệu; HR Copilot dùng tools chỉ đọc và RAG có ACL. Web chạy React/HeroUI trên vinext + Cloudflare Workers, dữ liệu PostgreSQL/pgvector và R2 private.

**Tiếp tục dự án:** đọc [docs/PROGRESS.md](docs/PROGRESS.md), [AGENTS.md](AGENTS.md). Không scaffold lại. Không commit/push. Không sửa `getdesign.io-design.md`.

## Chạy local trên Windows

Cần Node.js 24, Docker Desktop đang chạy, Python 3.12 và Chrome cho browser QA. Trong PowerShell tại root:

```powershell
npm ci
npm run setup
npm run infra:up -- --wait
npm run db:generate
npm run db:migrate
npm run db:roles
npm run db:seed
py -3.12 -m venv services/ai/.venv
services/ai/.venv/Scripts/python.exe -m pip install -r services/ai/requirements.txt
npm run models:download
npm run models:verify
npm run services:start
npm run doctor
```

Nếu `.venv` đã tồn tại, giữ nguyên và bỏ bước tạo venv. Không cần cài pretrained model ngoài hai model có checksum trong manifest; lệnh download lấy file thật từ OpenCV Zoo. Script start không migrate/seed/reset dữ liệu. Khi restart chỉ chạy `npm run services:start`. URL local: **http://127.0.0.1:3000**. Trạng thái đăng nhập yêu cầu đúng origin này.

Mở file local bị Git bỏ qua `.local/credentials.json` để lấy mật khẩu ngẫu nhiên cho `admin@abc.example`, `hr@abc.example`, `manager@abc.example`, `employee@abc.example`. Không đăng file hoặc mật khẩu lên chat/repository. Seed chỉ tạo đúng NV001–NV020 và dữ liệu nghiệp vụ có provenance `SEED`; seed lại giữ dữ liệu đã sửa. NV001–NV003 chưa có khuôn mặt.

`npm run services:status` kiểm tra listener/PID; log ở `.local/*.log`. `npm run services:stop` chỉ dừng process được script tạo, giữ DB và file. `npm run infra:down` dừng DB nhưng giữ volume. Không dùng `down -v` hoặc xóa `.wrangler` nếu muốn giữ dữ liệu. Local R2 của workerd được ghi xuống `.wrangler/state` trong workspace web; upload/download đi qua binding thật, không phải mảng lưu trong RAM.

## Production runtime preview

```powershell
npm run services:stop
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-services.ps1 start -WebMode preview
npm run doctor
npm run verify -- --http
```

Dừng preview trước mỗi build trên Windows để tránh khóa thư mục `dist`. Nếu port đã có process ngoài script, script giữ process đó; đóng terminal sở hữu nó trước khi đổi runtime. Có thể dùng riêng `npm run dev`, `npm run preview:cloudflare`, và `services/ai/.venv/Scripts/python.exe services/ai/run-local.py` / `... run-local.py worker` ở các terminal.

## AI và enrollment thật

Điền các biến LLM/embedding trong `.env`, chạy `npm run setup` để đồng bộ `.dev.vars`, rồi restart web/Python/jobs. Base URL là endpoint OpenAI-compatible, thường kết thúc bằng `/v1`; provider, model và dimension phải khớp thật. Không có API key thì Copilot báo `AI_NOT_CONFIGURED`, ingestion báo `EMBEDDINGS_NOT_CONFIGURED`; không có câu trả lời hoặc vector giả.

```powershell
npm run kb:ingest-seed
```

Lệnh trên upload 10 chính sách tiếng Việt qua API. Worker phải chạy để index. Sau khi bổ sung embedding config, vào Kho kiến thức và **Đánh chỉ mục lại** từng version thất bại; chỉ publish khi version READY. LLM và embedding dùng thông tin cấu hình độc lập. Xem [AI_WORKFLOWS](docs/AI_WORKFLOWS.md).

Enrollment cần người thật đồng ý qua tab Khuôn mặt trong hồ sơ NV001–NV003, cấp camera và thực hiện hướng dẫn quay đầu. Không dùng ảnh/video có sẵn hoặc fake webcam làm bằng chứng. Model readiness chỉ chứng minh tải/chạy inference được; chưa chứng minh độ chính xác, chống ảnh/video giả hoặc acceptance của ba người. Các bước cần người dùng nằm trong [USER_ACTIONS](docs/USER_ACTIONS.md).

## Kiểm thử

```powershell
npm run lint
npm run typecheck
npm test
npm run test:ai
npm run test:e2e
npm run verify -- --http
```

`verify` chạy các suite độc lập và lưu `artifacts/verification/verify*.log`/JSON. Exit **1** = có failure; **2** = còn PENDING/BLOCKED/NOT_RUN; **0** chỉ khi mọi mục đã kiểm chứng. `--build` chạy build; không dùng khi preview còn mở. `--http` bật kiểm tra HTTP/browser trên server đang chạy. `--providers` chỉ dùng sau khi có provider/key và chấp thuận chi phí gọi API thật. Test DB tạo bản ghi kiểm tra tạm và dọn đúng bản ghi của test; không chạy bộ test local trên database production.

Trên máy Windows hiện tại, các entry point Node liên quan đã có `--no-maglev` để tránh native crash đã quan sát ở Node24.15.0/build26200; không cần đặt biến hệ thống. Chi tiết và giới hạn ở ARCHITECTURE.

Kết quả cuối:63 TS tests passed/26 provider tests skipped,17 Python tests passed,27 browser checks/12 flows passed; build và local Workers preview đã kiểm tra. Tổng hợp exit2 `PENDING_ACCEPTANCE` vì các gate thật còn thiếu. Xem [VERIFICATION](docs/VERIFICATION.md) cho lệnh, exit code và evidence.

Doctor không in secret, không chụp webcam và không gọi provider tính phí. Nó kiểm tra config, version, DB/vector, model readiness, phiên đăng nhập và file private hiện có. Provider đã điền chỉ được báo CONFIGURED/NOT_RUN cho đến khi eval thật chạy.

## Deploy

**DEPLOYMENT_PENDING.** Chưa có public URL hoặc tài nguyên cloud được tạo. Cấu hình [infra/render.yaml](infra/render.yaml) định nghĩa API Python và ingestion worker chạy liên tục; [apps/web/wrangler.jsonc](apps/web/wrangler.jsonc) là đường Workers duy nhất. Hướng dẫn secret/migration/R2, smoke HTTPS và rollback ở [DEPLOYMENT](docs/DEPLOYMENT.md). Blueprint có hai service trả phí cần người dùng duyệt trước khi tạo. Không tự push source để deploy.

Lương trong ứng dụng là bảng lương quản trị nội bộ, không thực hiện chuyển tiền hay kê khai thuế. Biometric encryption key phải được giữ cùng quy trình backup riêng; mất khóa thì template không khôi phục được. Xem [MODEL_CARD](docs/MODEL_CARD.md), [TEST_PLAN](docs/TEST_PLAN.md) và các báo cáo verification để phân biệt phần đã chạy và các gate còn thiếu.
