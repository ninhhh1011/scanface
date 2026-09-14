# Hệ thống Thiết kế ABC HRM — HeroUI + Reviews.io

Tài liệu đặc tả Design System chính thức cho dự án ABC HRM, chuyển đổi toàn diện từ thiết kế cũ sang **HeroUI + Reviews.io Design System** theo nguồn `reviews.io-design.md`.

---

## 1. Nguồn thiết kế & Nguyên tắc cốt lõi

- **File nguồn thiết kế**: `reviews.io-design.md` (SHA256: `f2e405a9bf15ff732b1834007c4c2f7e393514b5cfa6cb659031e1b9bcc41edb`).
- **Thư viện thành phần (Component Library)**: `@heroui/react` 3.2.5 + `@heroui/styles` 3.2.5.
- **Tính cách thiết kế**: Tinh gọn, hiện đại, đáng tin cậy, định hướng SaaS chuyên nghiệp. Bảng màu Teal chủ đạo mang lại cảm giác an tâm, tươi mới, kết hợp hình khối bo tròn mềm mại (pills & rounded cards) và độ tương phản cao cho nghiệp vụ quản trị nhân sự.
- **Không gian màu**: Light theme soft-flat, nền canvas sáng `#F5F7F8`, card trắng nổi bật `#FFFFFF`, không dùng glassmorphism hay gradient sặc sỡ.

---

## 2. Bảng mã màu (Color Palette)

| Token | Giá trị HEX | Vai trò & Ứng dụng |
|---|:---:|---|
| `primary` | `#067C74` | Màu thương hiệu chính, CTA chính (Button primary), điểm nhấn kích hoạt, link/action |
| `accent-strong` | `#045F59` | Hover/Pressed của nút Primary, trạng thái kích hoạt sâu |
| `accent-soft` | `#E6F7F5` | Nền Mint nhẹ cho badge, chip, menu đang chọn (selected nav), hàng được chọn (selected row) |
| `secondary` | `#111827` | Màu chữ chính (on-surface/body/heading), nút phụ viền (Secondary CTA) |
| `tertiary` | `#F5F7F8` | Nền canvas toàn ứng dụng, nền bảng điều khiển, hover trạng thái thứ cấp |
| `surface` | `#FFFFFF` | Nền Card, Dialog, Modal, Dropdown, Menu, Form |
| `on-surface` | `#111827` | Màu chữ trên nền surface |
| `neutral` | `#FFFFFF` | Trắng tinh khiết cho chữ trên nền Primary CTA |
| `muted` | `#4B5563` | Màu chữ thứ cấp, nhãn metadata, icon mờ, hướng dẫn phụ |
| `border` | `#E5E7EB` | Đường viền thẻ, phân tách hàng bảng, viền trường nhập liệu |
| `success` | `#10B981` | Trạng thái tích cực (Đang hoạt động, Đã duyệt, Sẵn sàng, Đã đăng ký) |
| `warning` | `#F59E0B` | Trạng thái cảnh báo, chờ xử lý (Chờ duyệt, Đang xử lý, Đang rà soát) |
| `error` | `#DC2626` | Trạng thái lỗi, từ chối, thất bại (Thất bại, Từ chối, Đã chấm dứt) |

### Loại bỏ triệt để các mã màu cũ:
- `#FC6BF6` (Hồng GetDesign)
- `#B58CFF` (Tím GetDesign)
- `#A4DFF0` (Cyan cũ)
- `#0057FF` (Xanh điện cũ)
- `#131314` (Đen CTA cũ — thay bằng Teal `#067C74`)

---

## 3. Thang Typography (Hệ chữ)

Sử dụng phông chữ hệ thống `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` tối ưu hiệu năng và hiển thị tiếng Việt tự nhiên, hoàn toàn loại bỏ `@fontsource-variable/inter-tight`.

| Kiểu chữ (Token) | Kích thước | Line Height | Font Weight | Ngữ cảnh ứng dụng |
|---|:---:|:---:|:---:|---|
| `headline-display` | 56px | 61.6px | 500 | Vùng chào mừng đăng nhập, marketing hero |
| `headline-lg` | 48px | 57.6px | 500 | Tiêu đề lớn trang Dashboard / Hero |
| `headline-md` | 24px | 33.6px | 500 | Tiêu đề chính trang nghiệp vụ (Page Title) |
| `headline-sm` | 18px | 22px | 500 | Tiêu đề Card, Modal Heading, Section Title |
| `body-lg` | 18px | 1.55 | 400 | Đoạn văn mở đầu, thông báo quan trọng |
| `body-md` | 16px | 1.5 | 400 | Văn bản mặc định, chi tiết văn bản, tin nhắn chat |
| `body-sm` | 14px | 1.45 | 400 | Dữ liệu bảng (Table cells), nhãn metadata, chú thích |
| `label-lg` | 18px | 1.2 | 600 | Nút CTA kích thước lớn |
| `label-md` | 16px | 1.2 | 600 | Nút bấm thông dụng (Button label), Tab label |
| `label-sm` | 14px | 1.2 | 600 | Chip, Badge, Nút thao tác trong hàng bảng |
| `overline` | 12px | 1.0 | 600 | Phụ chú chữ hoa / trạng thái đếm nhỏ |
| `eyebrow` | 14px | 1.0 | 500 | Dòng chỉ mục phía trên tiêu đề trang |

---

## 4. Bán kính bo góc (Border Radius) & Khoảng cách (Spacing)

### Radius:
- `sm`: 4px (chi tiết nhỏ, checkbox indicator)
- `md`: 8px (trường nhập Input, Select trigger, Textarea, Tooltip)
- `lg`: 16px (Card phụ, Composer Chat, Code block)
- `xl`: 22px (Card chính, Panel nghiệp vụ, Dialog Modal, Drawer)
- `full`: 9999px (Nút CTA, Chip, Status Badge, Avatar, Search bar)

### Spacing Scale:
- `xs`: 2px, `sm`: 8px, `md`: 16px, `lg`: 24px, `xl`: 32px, `2xl`: 64px
- `gutter`: 24px (Khoảng cách lưới nội dung)
- `section`: 64px (Phân đoạn trang lớn)

---

## 5. Quy tắc thành phần (Component Guidelines)

### Button (Nút bấm):
- **Primary CTA**: Nền Teal `#067C74`, chữ trắng, bo tròn pill `9999px`. Nút chính màn hình Login/Submit lớn: chiều cao 59px, padding 16px 28px. Nút hành động thanh công cụ: chiều cao 40–44px, padding 10px 20px.
- **Secondary CTA**: Nền trắng `#FFFFFF`, viền xám nhẹ `1px solid #E5E7EB`, chữ `#111827`, bo tròn pill `9999px`. Hover đổi nền `#F5F7F8`.
- **Ghost / Link CTA**: Trong suốt, chữ `#067C74`, hover nền `#E6F7F5`.

### Thẻ dữ liệu (Cards & Panels):
- Nền `#FFFFFF`, bo góc 22px (`rounded-xl`), viền mảnh `1px solid #E5E7EB`, đổ bóng nhẹ `0 1px 3px rgba(0,0,0,0.04)`.

### Bảng dữ liệu (Table):
- Đầu bảng (Header): Nền `#F5F7F8`, chữ `#4B5563`, font-weight 600, chữ không bẻ dòng.
- Thân bảng (Row): Phân cách bằng `1px solid #F3F4F6`. Hover dòng đổi sang `#F9FAFB`. Hàng đang chọn (Active) đổi sang `#E6F7F5`.
- Ô dữ liệu: Cỡ chữ 14px, số tiền định dạng VND rõ ràng, ngày tháng theo giờ Việt Nam.

### Huy hiệu trạng thái (Status Chips & Badges):
- Bo tròn pill `9999px`, padding 4px 12px, cỡ chữ 13–14px.
- Tích cực: Nền Mint `#E6F7F5`, chữ Teal `#067C74`, viền `#A7F3D0`.
- Chờ duyệt/Cảnh báo: Nền Vàng nhạt `#FFFBEB`, chữ Vàng đậm `#D97706`, viền `#FDE68A`.
- Tiêu cực/Lỗi: Nền Đỏ nhạt `#FEF2F2`, chữ Đỏ `#DC2626`, viền `#FECACA`.
- Trung tính: Nền Xám `#F5F7F8`, chữ Xám đậm `#4B5563`, viền `#E5E7EB`.

### Hộp thoại & Popover (Modal, Dialog, Select Popover):
- Portal backdrop: `rgba(17, 24, 39, 0.45)` tạo độ tập trung.
- Container: Bo góc 22px (`rounded-xl`), nền trắng, padding 28px, nút đóng tròn tinh tế.

### Trợ lý HR Copilot & Kho tri thức:
- Khung chat: Nền thẻ trắng tinh, viền `#E5E7EB`, bóng nhẹ.
- Tin nhắn User: Nền Mint `#E6F7F5`, chữ `#111827`, viền `#CCF0EB`, căn phải.
- Tin nhắn Copilot: Nền trắng `#FFFFFF`, viền `#E5E7EB`, căn trái, trích dẫn văn bản dạng Pill `#F5F7F8`.
- Biểu tượng Copilot: Nền Teal `#067C74`.

### Bảng màu biểu đồ (Charts):
- Chuỗi 1: `#067C74` (Teal)
- Chuỗi 2: `#111827` (Charcoal)
- Chuỗi 3: `#10B981` (Emerald)
- Chuỗi 4: `#F59E0B` (Amber)
- Chuỗi 5: `#6366F1` (Indigo)
- Chuỗi 6: `#EC4899` (Rose)
