# Báo Cáo Migration Frontend — HeroUI + Reviews.io Design System

## 1. Thông Tin Chung & Phiên Bản Stack
- **Dự án**: ABC HRM
- **Thư viện Component**: HeroUI v3 (`@heroui/react` 3.2.5, `@heroui/styles` 3.2.5)
- **Framework & Runtime**: Next.js 15 App Router (`@vinext/core` 8.3.0 trên Vite 8.3.0 / OpenNext Cloudflare Workers runtime)
- **Styling**: Tailwind CSS v4 (`@import "tailwindcss"; @import "@heroui/styles";`)
- **Nguồn thiết kế hiệu lực**: `reviews.io-design.md` (SHA256: `f2e405a9bf15ff732b1834007c4c2f7e393514b5cfa6cb659031e1b9bcc41edb`)
- **Trạng thái tệp thiết kế cũ**: Đã xóa triệt để `getdesign.io-design.md` khỏi workspace.
- **Local URL đang chạy**: `http://127.0.0.1:3000` (Cloudflare Preview via `npm run preview:cloudflare`)
- **Python AI Service**: `http://127.0.0.1:8000` (YuNet + SFace)

---

## 2. Token Mapping & Adaptations

### Hệ Màu Reviews.io
| Token | Giá trị Hex | HeroUI Mapping & Vai trò |
|---|---|---|
| `primary` | `#067C74` | `--primary`, `--accent`: Nút CTA chính (pill), active links, focus rings |
| `primary-hover` | `#045F59` | `--primary-hover`, `--accent-hover`: Hover trạng thái CTA chính |
| `secondary` | `#111827` | `--secondary`: Tiêu đề chính, văn bản đậm, instruction badge camera |
| `tertiary` | `#F5F7F8` | `--background`, `--tertiary`: Canvas nền trang, table header, neutral chips |
| `surface` | `#FFFFFF` | `--surface`: Nền card (radius 22px), modal dialog, panels |
| `muted` | `#4B5563` | `--muted`: Văn bản phụ, nhãn metadata, date labels |
| `border` | `#E5E7EB` | `--border`, `--field-border`: Đường viền phân cách, viền card và ô nhập |
| `accent-soft` | `#E6F7F5` | `--accent-soft`: Nền badge positive, active nav item, first metric card |
| `accent-strong` | `#045F59` | `--accent-strong`: Active/pressed state của các thành phần teal |
| `success` | `#10B981` | Trạng thái thành công nghiệp vụ (kèm nền mint `#E6F7F5`) |
| `warning` | `#F59E0B` | Trạng thái cảnh báo/chờ duyệt (`#D97706` text trên `#FFFBEB`) |
| `danger` / `error` | `#DC2626` | Trạng thái lỗi/từ chối/hủy (`#DC2626` text trên `#FEF2F2`) |

### Typography & Radii
- **Font chữ**: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` (đã loại bỏ hoàn toàn `@fontsource-variable/inter-tight`).
- **Radii**:
  - `sm` (4px): Chi tiết nhỏ
  - `md` (8px): Inputs, TextAreas, Select triggers (`--field-radius`)
  - `lg` (16px): Bảng thông báo (`.notice`), composer box
  - `xl` (22px): Cards, panels, modal dialogs (`--card-radius`)
  - `full` (9999px): Buttons, chips/badges, navigation pills, circular avatar tags
- **Adaptations cho HRM**:
  - Button chiều cao chuẩn thích ứng nghiệp vụ: 42px (nút bảng/form), 50px (nút đăng nhập), 38px (navigation pills).
  - Metric card đầu tiên trên Dashboard có nền mint mềm `#E6F7F5` với con số màu teal `#067C74`, 3 card tiếp theo dùng surface trắng với số `#111827`.
  - Giữ lại cấu trúc video/canvas trực tiếp trong `FacePanel` phục vụ liveness detection mà không bọc gượng ép vào wrapper HeroUI.

---

## 3. Độ Phủ Route & Component

| Route / Thành phần | Component HeroUI Sử Dụng | Hiện Trạng Thiết Kế Reviews.io |
|---|---|---|
| `/login` | `TextField`, `Input`, `FieldError`, `Button` | Card 22px, Teal brand mark `a.`, Pill button `Đăng nhập →` |
| `/dashboard` | `Button`, Layout Grid, Table, Badges | 4 metric cards (card 1 mint `#E6F7F5`), bảng chấm công gần đây |
| `/employees`, `/employees/:id` | `Tabs`, `Table`, `Status`, `Button`, `Modal` | Hero card nhân viên, avatar initials "NA", tab pills, CRUD modal |
| `/attendance`, `/attendance/scan` | `Choice` (Select), `Checkbox`, `Button`, Video stage | Camera stage 22px, placeholder tròn đồng tâm teal, pill instruction |
| `/schedule`, `/shifts` | `CalendarTable`, `Button`, `Dialog` | Bảng phân ca tuần, nút ca bo tròn 8px, bộ lọc dropdown |
| `/timesheets`, `/payroll` | `RecordsTable`, `Button`, `Confirm` | Bảng công và lương, action locks/reopen/export CSV |
| `/leave`, `/overtime`, `/performance` | `Select`, `TextField`, `Dialog`, `Status` | Form đăng ký nghỉ/tăng ca/đánh giá, pill chip trạng thái |
| `/assistant` (HR Copilot) | `TextArea`, `Button`, `Dialog` | Biểu tượng hoa thị teal `✳`, chat bubble mint cho user, trích dẫn pill |
| `/knowledge-base` | `Table`, `Input[type=file]`, `Dialog`, `Button` | Quản lý phiên bản tài liệu RAG, thẻ version 22px |
| Global Modals & Dialogs | `Modal`, `Modal.Dialog`, `Confirm` | Modal radius 22px, footer pill buttons, overlay mờ nhẹ |

---

## 4. Kết Quả Kiểm Thử & Xác Minh Hệ Thống

| Nhóm kiểm tra | Lệnh thực hiện | Kết quả | Chi tiết |
|---|---|---|---|
| Static Analysis | `node scripts/doctor.mjs` | **PASS (0)** | `design_unchanged: PASS`, `persistent_records: OBSERVED (20 employees, 40 chunks)`, `python_model_readiness: PASS`, `web_reachable: PASS` |
| Linter | `npm run lint` | **PASS (0)** | 0 warnings, 0 errors trên 53 tệp tin |
| Typecheck | `npm run typecheck` | **PASS (0)** | TypeScript compiler sạch lỗi |
| Unit & Integration Tests | `npm run test` (Vitest) | **PASS (0)** | 12 test files passed, 49 tests passed, 0 failures |
| AI Service Unit Tests | `npm run test:ai` | **PASS (0)** | 17/17 tests passed |
| Production Build | `npm run build` | **PASS (0)** | Vite + Rollup + OpenNext build thành công |
| E2E Browser QA | `scripts/browser-qa.mjs` | **PASS (0)** | Chrome headless: 27 checks passed, 0 page errors, 4 roles (admin/hr/manager/employee) |
| E2E Business Flows | `scripts/browser-flows.mjs` | **PASS (0)** | 12 nghiệp vụ (tạo phòng ban, nhân viên, phân ca, hợp đồng, đính kèm, bảng công CSV...) đạt 100% |

---

## 5. Danh Sách & Xác Minh Hình Ảnh (Visual Verification)

Toàn bộ 24 ảnh chụp kiểm chứng được lưu trữ tại `artifacts/verification/screenshots/`:
- **Độ phân giải máy tính bàn (1440x900)**:
  - `login-1440.png`: Form đăng nhập căn giữa, card mềm 22px, nút teal `Đăng nhập →`.
  - `dashboard-1440.png`: Topbar pill navigation, metric card 1 mint `#E6F7F5`, bảng chấm công.
  - `attendance-scan-employee-1440.png`: Màn hình camera stage chấm công cá nhân, selector vào/ra ca, consent checkbox.
  - `employee-detail-1440.png` & `face-enrollment-nv001-1440.png`: Hồ sơ chi tiết NV001, avatar initials "NA", tabs pill bo tròn với tab hoạt động chữ trắng trên nền teal `#067C74`.
  - `assistant-1440.png`: Giao diện HR Copilot với gợi ý câu hỏi pill, sidebar lịch sử hội thoại.
  - `knowledge-base-1440.png`: Bảng tài liệu tri thức nội bộ.
- **Độ phân giải di động (390x844)**:
  - `login-390.png`: Co giãn mượt mà, không bị tràn màn hình ngang.
  - `dashboard-390.png`: Header rút gọn thành avatar "Tôi" tròn, thanh điều hướng cuộn ngang, lưới 2x2 metric thẻ sạch sẽ.
- **Độ phân giải Tablet & Laptop (768x1024, 1024x768)**:
  - Xác nhận không có hiện tượng vỡ layout, mất thanh điều hướng hay chồng chéo chữ.

---

## 6. Trạng Thái Cổng Nghiệp Vụ Chưa Hoàn Tất (Pending Gates)

1. **`human_face_acceptance` (BLOCKED/PENDING)**:
   - Theo đúng yêu cầu trực tiếp của người dùng: **Face Enrollment là bước cuối cùng**.
   - Không thực hiện tạo khuôn mặt giả hoặc faked biometric tests.
   - Sẵn sàng để người dùng thực hiện quét khuôn mặt thật qua webcam trên `http://127.0.0.1:3000`.
2. **`online_deployment` (PENDING)**:
   - Sẵn sàng kịch bản build/deploy; chờ thông tin tài khoản Cloudflare/Linux host từ người dùng khi có chỉ thị.
