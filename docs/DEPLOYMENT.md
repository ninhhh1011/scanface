# Deployment — DEPLOYMENT_PENDING

Không có cloud credential, project online hoặc URL public đã kiểm chứng. File này là runbook; không phải bằng chứng triển khai. Không commit/push/provision/bật billing đã được thực hiện.

## Topology và config

- Cloudflare Workers: `apps/web/wrangler.jsonc`, vinext duy nhất, `nodejs_compat`, Prisma edge + driver pg. Không giữ đường OpenNext cạnh tranh.
- Neon/project PostgreSQL 17 có `vector` và `btree_gist`; TLS bắt buộc cho remote. Migration dùng kết nối direct/owner. Web dùng tài khoản ứng dụng; Python dùng `abc_ai` với quyền hẹp, không cấp mật khẩu user/UPDATE HR/payroll.
- R2 private `abc-hrm-private`, binding `PRIVATE_FILES`. Không bật public bucket/r2.dev. Files có metadata PostgreSQL, blob R2 và route download luôn kiểm tra session/scope.
- Render Blueprint `infra/render.yaml`: Linux API và background ingestion worker độc lập. Hai plan `1c-2g` là đề xuất tài nguyên cần duyệt chi phí; chưa benchmark plan thật. Không hứa free tier hoạt động liên tục. Auto deploy tắt.

Blueprint dùng các field theo [Render Blueprint specification](https://render.com/docs/blueprint-spec); database hỗ trợ [pgvector trên Neon](https://neon.com/docs/ai/ai-concepts). Workers/adapter nguồn ở ARCHITECTURE.md. Models được pin/download/checksum trong Docker build, không tải mỗi request. Templates/jobs/chunks nằm trong DB, raw file ở R2; container disk không giữ bản dữ liệu duy nhất.

## Quy trình sau khi có account và quyền chi phí

1. Chọn database riêng của ABC HRM, bật vector/btree_gist theo migration. Tạo file env production riêng nằm ngoài source hoặc ignored, đặt URL TLS; không sửa/xóa DB local. Dùng owner để chạy `prisma migrate deploy` riêng. Không dùng `migrate dev`, `db push` hoặc reset production.
2. Provision role Python bằng `node --env-file=.env scripts/db-roles.mjs --provision` trong môi trường owner có `APP_ENV=production`. Thực hiện từ bản copy triển khai riêng; không thay `.env` của workspace local đang chạy. File `.env` đích là config deployment vì script ghi `AI_DATABASE_URL` vào đó. Sao lưu khóa ở secret manager. Không đưa DB owner cho Python. Kiểm tra ba negative privileges script in ra.
3. Tạo private R2 bucket, gắn `PRIVATE_FILES`; đặt `CLOUDFLARE_ACCOUNT_ID` và đăng nhập Wrangler/token qua phương tiện local bảo mật. Credential không xuất hiện trong `wrangler.jsonc`. Nếu đổi bucket name, sửa binding cùng tên ở file đó.
4. Người dùng cung cấp source repository private hoặc image registry đã được phép publish; không tự commit/push để thỏa bước này. Chọn `infra/render.yaml` làm Blueprint path, điền biến `sync:false`. API và worker dùng cùng `AI_DATABASE_URL`/`SERVICE_AUTH_KEY`; chỉ API có `FACE_ENCRYPTION_KEY`. Worker cần APP_URL HTTPS và embedding config thật. API có /healthz public tối giản; /readyz cần bearer service key và kiểm tra DB/model/crypto. Health probe Render dùng /healthz; operator phải kiểm tra readiness trước acceptance.
5. Cấu hình Workers secrets qua dashboard hoặc `wrangler secret put NAME` (prompt ẩn), không truyền secret trên command line: APP_URL, DATABASE_URL, AUTH_SECRET, SERVICE_AUTH_KEY, AI_SERVICE_URL; LLM_PROVIDER/BASE_URL/API_KEY/MODEL và EMBEDDING_PROVIDER/BASE_URL/API_KEY/MODEL/DIMENSION nếu dùng Copilot. Cấu hình APP_ENV=production. APP_URL và AI_SERVICE_URL phải HTTPS; browser chỉ gọi web cùng origin.
6. Build local đã kiểm chứng; chạy `npm run deploy:check` với env production. Chế độ này chỉ kiểm tra biến bắt buộc/HTTPS/production, không đăng nhập website, không tạo tài nguyên và không chứng minh domain/binding online. Exit0 nghĩa config có mặt, trạng thái vẫn DEPLOYMENT_PENDING; exit2 nghĩa thiếu cấu hình. Khi đã được phép triển khai, chạy `npm run deploy:web`. Không seed trong build/start/deploy. Seed production nếu cần đúng bộ dữ liệu mẫu phải chạy một lần chủ động và lưu credential ngoài source; không công khai test password.
7. Mở HTTPS thật kiểm tra đăng nhập/cookie secure, scoped CRUD, audit, private upload/download, outbound Python /readyz, consent/enrollment/scan thật, ingestion/retry/publish/retrieve/citation thật, role revocation và persistence sau restart. Chỉ ghi DEPLOYED sau khi command deploy thành công và smoke URL online có artifact. Chưa chạy thì giữ NOT_RUN.

## Backup, restart, rollback

Backup PostgreSQL bằng managed backup/PITR hoặc `pg_dump` trên host được ủy quyền; lưu backup mã hóa cùng chính sách retention, thử restore sang database cô lập. Backup/private R2 theo phiên bản lưu trữ và kiểm tra metadata/blob cùng bản khôi phục. Encryption key phải được giữ ở secret manager riêng cùng phiên bản; không rotate bằng cách thay chuỗi rồi làm mất khả năng giải mã template hiện tại.

Trước migration lấy backup và kiểm tra tương thích schema. Rollback application dùng bản build trước; không tự rollback migration phá dữ liệu. Worker dùng lease/retry và checkpoint DB, có thể restart không xóa queue; job quá 3 lần chuyển FAILED và hiển thị mã lỗi thật. Đổi provider/model/dimension cần reindex version; chỉ publish sau index thành công, không trộn vector cũ/mới.

Đo cold start, RSS/CPU và concurrency trên plan thật bằng request được consent; không có ping loop né idle. Theo dõi lỗi 5xx/queue age/retry/capacity bằng counters và audit không chứa ảnh/template/key. Nếu service đang warming hoặc hạ tầng lỗi, UI phải báo lỗi dịch vụ/retry; không chuyển thành UNKNOWN hay MATCHED giả.

Local deployment preflight note: an initial nested npm command swallowed `--dry-run` and reached Wrangler, which refused execution because no CLOUDFLARE_API_TOKEN was supplied. No temporary account or deployment was created. Root `deploy:web` now forwards arguments with an explicit `--`; the corrected dry run is separate from any online claim. Never use Wrangler temporary account bypass to replace the user cloud gate.
