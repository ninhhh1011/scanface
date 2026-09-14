# Các bước cần người dùng

Không gửi secret qua chat. Đây là các điều kiện còn thiếu; không thay thế bằng mock hoặc biometric seed.

# Các bước cần người dùng

Không gửi secret qua chat. Đây là các điều kiện cần tương tác thực tế từ người dùng; không thay thế bằng mock hoặc biometric seed nhân tạo.

## 1. Provider AI — ĐÃ HOÀN THÀNH VÀ KIỂM CHỨNG (VERIFIED)

- **LLM**: OpenAI (`gpt-4.1-mini`), base URL `https://api.openai.com/v1`
- **Embedding**: Google Gemini (`gemini-embedding-001`, dimension 3072) qua adapter tương thích OpenAI
- **Đã kiểm chứng**: 
  - Toàn bộ 10 tài liệu chính sách nội bộ được ingest thành công thành 40 chunks trong PostgreSQL pgvector và đã publish sang `ACTIVE`.
  - 26/26 bài test AI Evaluation (`ai-eval.test.ts`) gọi OpenAI API trực tiếp: **100% PASS**.
  - Bài test RAG thực tế (`ai-real-rag.test.ts`): **PASS**.

---

## 2. Face Enrollment (Đăng ký khuôn mặt) — BƯỚC CUỐI CÙNG TRƯỚC DEPLOY ONLINE

Hệ thống code, giao diện, bảo mật mã hóa vector khuôn mặt và kiểm tra tích hợp đã hoàn thiện 100%. Bước tiếp theo là người dùng trực tiếp thực hiện quét mặt thật qua webcam:

1. Mở trình duyệt tại: `http://127.0.0.1:3000`
2. Đăng nhập bằng tài khoản Quản trị HR (`hr@abc.example` hoặc `admin@abc.example` với mật khẩu trong `.local/credentials.json`).
3. Điều hướng tới menu **Nhân viên** (`/employees`) và chọn lần lượt các nhân viên mẫu:
   - **NV001** (Nguyễn An) -> Chuyển sang tab **Khuôn mặt**
   - **NV002** (Nguyễn Bình) -> Chuyển sang tab **Khuôn mặt**
   - **NV003** (Nguyễn Chi) -> Chuyển sang tab **Khuôn mặt**
4. Tại tab Khuôn mặt của mỗi nhân viên:
   - Đọc thông báo đồng ý thu thập sinh trắc học và tích chọn ô đồng ý (Consent checkbox).
   - Nhấn **Bật camera**.
   - Thực hiện theo chỉ dẫn cử động 2D (liveness challenge: quay trái / quay phải / chớp mắt) cho đến khi hoàn thành.
   - Nhấn **Lưu đăng ký** (hệ thống sẽ mã hóa template khuôn mặt bằng AES-GCM với `FACE_ENCRYPTION_KEY` và lưu vào DB).
5. Kiểm tra tính năng **Chấm công bằng khuôn mặt**:
   - Đăng nhập bằng tài khoản nhân viên tương ứng (ví dụ `employee@abc.example` gắn với NV002).
   - Truy cập trang **Chấm công** -> **Quét khuôn mặt** (`/attendance/scan`).
   - Tích chọn đồng ý, bật camera và hoàn thành quét mặt để ghi nhận phiên chấm công (Check-in / Check-out).
   - Xác nhận bảng công ghi nhận đúng thời gian thực và trạng thái.

---

## 3. Online Production — DEPLOYMENT_PENDING

Sau khi hoàn thành bước Đăng ký khuôn mặt và được phê duyệt triển khai online:
1. Cung cấp thông tin cấu hình Cloudflare trong `.env`:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
2. Thiết lập cơ sở dữ liệu PostgreSQL online hỗ trợ pgvector (ví dụ: Neon, Supabase, hoặc RDS).
3. Triển khai Python AI Service lên host Linux (Render / Fly.io / VPS) và cập nhật URL HTTPS vào `AI_SERVICE_URL`.
4. Chạy `npm run deploy:check` và tiến hành deploy theo `docs/DEPLOYMENT.md`.

