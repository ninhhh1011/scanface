# CODEX — ĐỒNG BỘ TOÀN BỘ FRONTEND ABC HRM BẰNG HEROUI + REVIEWS.IO

## 0. NHIỆM VỤ VÀ THỨ TỰ ƯU TIÊN

Tiếp tục dự án ABC HRM hiện có. Đây là migration toàn bộ giao diện và design system, KHÔNG phải scaffold một dự án mới. Kiểm tra workspace thực tế; không dựa vào mô tả “folder chỉ có design.md” của master prompt ban đầu.

Yêu cầu thiết kế MỚI này thay thế mọi chỉ dẫn cũ về Get Design, palette đen/hồng/tím và font Inter Tight. Những yêu cầu nghiệp vụ, security, persistence, deployment và thứ tự kiểm chứng của dự án vẫn giữ nguyên.

Nguồn thiết kế duy nhất đang có hiệu lực:

    reviews.io-design.md

Website tham khảo hình thức:

    https://www.reviews.io/

Thư viện component bắt buộc:

    https://github.com/heroui-inc/heroui

Đọc TOÀN BỘ reviews.io-design.md trước khi sửa. File này là bản thiết kế người dùng chọn; website chỉ bổ sung ngữ cảnh hình ảnh. Nếu website hiện tại khác file thì ưu tiên file và ghi rõ khác biệt, không âm thầm thay palette. Không sao chép logo Reviews.io, nội dung bán hàng, testimonial hoặc nghiệp vụ của họ. Sản phẩm vẫn là ABC HRM.

Nếu có browser, mở website Reviews.io và quan sát CTA, navigation, card, typography, spacing để tham khảo cách phối màu; không chỉ đọc HTML rồi khẳng định đã nhìn giao diện. Không truy cập được website thì vẫn triển khai theo file mới và ghi rõ giới hạn, không để việc tham khảo chặn migration.

Mục tiêu: mọi màn hình, component, overlay và trạng thái tương tác sử dụng cùng nền tảng HeroUI và cùng hệ màu/font/hình khối mới. Không chỉ đổi màu một trang hoặc phủ CSS toàn cục lên component cũ.

## 1. THAY NGUỒN THIẾT KẾ CŨ

Sau khi xác nhận reviews.io-design.md đã tồn tại và đọc được trong workspace:
- Giữ nguyên nội dung file mới.
- Xóa getdesign.io-design.md khỏi working tree theo yêu cầu người dùng. Đây là ngoại lệ có chủ đích đối với yêu cầu giữ file cũ trong master prompt trước.
- Cập nhật AGENTS.md, MASTER_PROMPT_CODEX_HRM.md nếu có, README và các tài liệu/spec đang có hiệu lực: đổi nguồn thiết kế sang reviews.io-design.md; bỏ palette, font và chỉ dẫn thiết kế cũ.
- Trong AGENTS.md ghi rõ dự án ĐÃ được triển khai, tiếp tục code hiện có; không scaffold lại theo trạng thái khởi đầu của master prompt.
- Ghi một dòng quyết định superseded trong lịch sử migration nếu cần. Không rewrite Git history và không sửa bằng chứng/log lịch sử chỉ để xóa tên cũ.
- Xóa import font, theme, asset trang trí và dependency chỉ phục vụ thiết kế cũ SAU khi xác nhận không còn được sử dụng.

Nếu file mới chưa được đặt vào workspace: yêu cầu đúng file reviews.io-design.md một lần. Không xóa nguồn cũ trước khi có nguồn thay thế; không tự dựng lại file từ trí nhớ.

Không xóa database, migrations, seed nghiệp vụ, tài liệu RAG, cấu hình cloud, secret, face profiles hoặc thay đổi dữ liệu để phục vụ redesign.

## 2. AUDIT TRƯỚC KHI SỬA

Đọc AGENTS.md, trạng thái tiến độ và cấu trúc source thực tế. Kiểm tra package.json, lockfile, versions React/framework/Tailwind/HeroUI, shared UI, CSS entrypoints, theme providers và cấu hình build/deploy hiện có.

Nếu có Git, ghi nhận branch và git status; bảo toàn thay đổi chưa commit. Không git reset/clean hoặc ghi đè công việc người dùng.

Lập inventory ngắn cho:
- Các route và role thực sự tồn tại.
- Primitive/component đang dùng HeroUI, tự viết hoặc thuộc thư viện UI khác.
- Theme/font/hex colors hardcode, CSS overrides, chart colors và styles cho portals.
- Baseline lỗi build/test/DB/service trước migration, phân biệt với regression do mình tạo.

Nếu database local đang dừng, dùng command hạ tầng hiện có như npm run infra:up khi đã xác minh script tồn tại. Không reset hoặc seed đè. Thiếu backend không phải lý do dựng dữ liệu giả để che lỗi.

Chụp baseline những màn quan trọng nếu browser khả dụng. Audit ngắn rồi triển khai ngay; không dành toàn bộ phiên để lập kế hoạch.

## 3. TÍCH HỢP HEROUI THỰC SỰ

Đọc tài liệu chính thức đúng major version và đối chiếu API/export thực tế:
- https://heroui.com/llms.txt
- https://heroui.com/en/docs/react/getting-started/quick-start
- https://heroui.com/en/docs/react/getting-started/theming
- https://github.com/heroui-inc/heroui

Nếu dự án đã dùng HeroUI v3, giữ dòng v3 và theme lại. Nếu chưa có HeroUI, chọn phiên bản tương thích sau audit, ưu tiên v3 khi stack đáp ứng requirements chính thức. Nếu cần nâng major dependency, làm migration có kiểm chứng; không tự thay framework hoặc đường deploy chỉ để đổi UI. Không trộn API/setup v2 và v3.

Cài package chính thức bằng package manager/lockfile hiện có; khóa dependency nhất quán. Không clone toàn bộ monorepo HeroUI vào root. Không bịa tên component, props, CSS variables hoặc provider requirement.

Các primitive thông dụng phải dùng HeroUI hoặc wrapper mỏng quanh HeroUI khi version đó có hỗ trợ: button, text field/input, textarea, select/combobox, checkbox, radio, switch, date controls, tabs, card, chip/badge, modal/dialog, drawer, dropdown/popover, tooltip, pagination, loading/skeleton, progress và toast.

Table dùng component HeroUI phù hợp khi có; sorting/filtering/pagination và business logic hiện có phải được giữ. Không thay table engine chỉ để có nhãn HeroUI. Với primitive thực sự chưa có, dùng composition/semantic HTML theo token chung và ghi ngoại lệ rõ ràng.

Không bắt video/canvas của camera, Markdown renderer, charts hoặc toàn bộ HTML layout thành component HeroUI. Giữ thư viện chuyên biệt đang cần thiết, nhưng đồng bộ theme của chúng. Không thêm một design system thứ hai như MUI/Ant Design/shadcn để làm các control HeroUI đã có.

Đặc biệt kiểm tra khi thay component: controlled state, giá trị Select, date/timezone, validation, form submission, keyboard interaction, disabled/loading, focus restoration. Không được chỉ đổi import rồi làm hỏng hành vi.

Giữ server/client boundary phù hợp. Không biến toàn bộ ứng dụng thành client rendering chỉ vì thêm UI library.

## 4. HỆ MÀU MỚI — ĐÚNG FILE NGUỒN

Thiết lập token tập trung từ reviews.io-design.md:

    primary        #067C74
    secondary      #111827
    tertiary       #F5F7F8
    neutral        #FFFFFF
    surface        #FFFFFF
    on-surface     #111827
    muted          #4B5563
    border         #E5E7EB
    success        #10B981
    warning        #F59E0B
    error          #DC2626
    accent-soft    #E6F7F5
    accent-strong  #045F59

Áp dụng cho sản phẩm:
- CTA chính: teal primary, chữ trắng; hover/pressed theo accent-strong.
- CTA phụ: surface trắng, chữ secondary, border nhẹ; hover tertiary.
- Link/utility action: primary, không dùng xanh điện/tím của thiết kế cũ.
- Canvas nghiệp vụ: tertiary; card/form/panel: surface. Đây là lựa chọn composition cho HRM.
- Heading/body: on-surface; mô tả/metadata: muted.
- Selected navigation, selected row và informational callout: accent-soft + foreground phù hợp; không biến toàn bộ màn hình thành nền teal.
- Success/warning/error phục vụ trạng thái, không dùng làm màu trang trí tùy ý.

Map token app vào semantic variables/variants mà HeroUI version thực tế sử dụng; không giả định đổi biến tên primary sẽ tự đổi mọi component. Cần kiểm tra cả field, focus, hover, soft variant, disabled, selected, overlays và portal ngoài app container.

Màu UI chỉ được định nghĩa tại theme/token layer và chart palette dùng chung. Không rải hex trong TSX hoặc thêm hàng loạt !important để thắng styles cũ. Quét literal hex, rgb/hsl/oklch và utility màu cũ, nhưng KHÔNG replace mù quáng các giá trị còn hợp lệ như trắng, màu lỗi, màu media hoặc nội dung tài liệu.

Dọn nhận diện màu cũ #FC6BF6, #B58CFF, #A4DFF0, #0057FF và primary near-black cũ khỏi các thành phần thương hiệu. Không dùng nút đen làm CTA chính nữa. Không tô lại video/ảnh gốc.

## 5. TYPOGRAPHY, RADIUS VÀ SPACING

Font toàn ứng dụng theo nguồn mới: system-ui; dùng fallback hệ thống phù hợp tiếng Việt. Loại Inter Tight khỏi UI và bỏ tải font không còn cần thiết.

Bảo toàn thang chữ nguồn:
- headline-display: 56px / 61.6px, weight 500.
- headline-lg: 48px / 57.6px, weight 500.
- headline-md: 24px / 33.6px, weight 500.
- headline-sm: 18px / 22px, weight 500.
- body-lg/md/sm: 18/16/14px, weight 400, line-height theo file.
- label-lg/md/sm: 18/16/14px, weight 600.
- overline: 12px; không dùng cỡ này làm mặc định cho nội dung nghiệp vụ.

Radius: sm 4px, md 8px, lg 16px, xl 22px, full 9999px.
Spacing nguồn: xs 2px, sm 8px, md 16px, lg 24px, xl 32px, 2xl 64px, gutter 24px, section 64px.

Card cơ sở: radius 22px, padding 18px. Input: radius 8px, padding 14px 16px. Chip: pill, padding 6px 12px. CTA nổi bật theo nguồn: cao 59px, padding 16px 28px.

PHẦN ADAPTATION CHO HRM — các quy tắc dưới là quyết định triển khai, không phải số đo mới suy ra từ website:
- Không ép mọi nút toolbar cao 59px. Giữ token CTA 59px; thêm app-control variants 40/44/48px nhất quán theo ngữ cảnh, ghi vào design notes.
- Headline 56/48px chỉ dành cho vùng giới thiệu phù hợp; page title nội bộ dùng 24px, section 18px. Không nhét hero vào từng màn CRUD.
- Table/list dùng 14px trở lên cho nội dung chính; nội dung đọc dài dùng 16px. Kiểm tra tên tiếng Việt, số tiền và nội dung dài không bị cắt khó hiểu.
- Không áp section gap 64px vào từng dòng form. Dùng 8/16/24/32px cho nhịp thao tác.
- Canvas sáng, card trắng, soft-flat, border nhẹ; không glassmorphism, neon, gradient mạnh hoặc shadow chồng lớp.

Ghi mọi token bổ sung/contrast adjustment vào docs/DESIGN_SYSTEM.md; giữ file thiết kế nguồn nguyên vẹn. Đây là một theme sáng thống nhất. Không tự sinh theme tối chưa được đặc tả hoặc để OS theme khiến một số trang tự chuyển tối.

## 6. THAY TOÀN BỘ CÁC MÀN HÌNH

Lấy route inventory thực tế làm checklist; không đoán route rồi tạo màn thay thế. Bao phủ mọi route hiện có và layout theo role:
- Login và các màn tài khoản/auth đã triển khai.
- Dashboard, nhân viên, hồ sơ chi tiết, phòng ban, chức vụ, hợp đồng.
- Ca làm, chấm công, điều chỉnh công, lịch sử, bảng công.
- Nghỉ phép, OT, phê duyệt, tổng hợp lương nội bộ, đánh giá.
- Tài liệu, thông báo, báo cáo, tài khoản, vai trò/quyền, audit.
- HR Copilot, chat history, composer, tool-result cards, citations và source drawer.
- Knowledge Base: upload, danh sách, index status, version, publish/deactivate, access settings.
- Face Enrollment, Face Attendance, consent, trạng thái camera, quality errors, unknown/ambiguous, re-enroll và delete profile.
- 403/404/error/loading/empty và các trang phụ hiện có.

Cả modal, confirm dialog, dropdown, toast, tooltip, pagination, table toolbar, filter panel và responsive drawer phải chuyển cùng theme. Không chỉ làm các trang nổi bật rồi bỏ lại màn phụ.

Giữ navigation phù hợp ứng dụng HRM, text-first và phân nhóm rõ; không sao chép menu bán hàng Reviews.io. Desktop và mobile phải có đầy đủ đường tới chức năng được cấp quyền. Không ẩn quyền ở frontend thay cho server authorization.

Nếu inventory phát hiện tính năng chưa được triển khai từ trước, ghi riêng là pre-existing gap và giữ trong backlog hoàn thiện nghiệp vụ. Không dựng placeholder rồi báo đã hoàn thiện.

## 7. SHARED UI, TABLE, CHART VÀ CHAT

Tận dụng cấu trúc source đang có. Chỉ thêm/sửa những abstraction cần thiết như:
- Theme/tokens dùng chung.
- PageHeader, FormField, StatusBadge, ConfirmDialog.
- DataTable shell/toolbar, EmptyState, ErrorState, LoadingState.
- MetricCard, chart palette, document source card.

Không tạo một framework wrapper mới che hết API HeroUI. Wrappers phải mỏng, typed và giải quyết nhu cầu lặp lại thật.

Tables: header rõ, selected/hover nhẹ, action menu nhất quán, filter/pagination giữ hành vi hiện có. Bảng rộng dùng scroll có kiểm soát, sticky column khi có ích; không gây tràn ngang toàn viewport.

Charts: giữ thư viện chuyên dụng hiện có. Dùng palette tập trung hài hòa teal/slate/mint; bảo đảm các series phân biệt được bằng label/pattern/legend, không chỉ màu. Palette mở rộng phải ghi là adaptation, không khẳng định file nguồn có sẵn. Tooltip, axis và font cũng theo theme mới.

Chatbot: giao diện cùng hệ HRM, không một “chat app” tách màu khác. Message, composer, citation, source drawer, loading, retry và access-denied đồng bộ. Cập nhật được stream/scroll theo implementation hiện có; không làm mất nguồn, trạng thái lỗi hoặc filter quyền. Render Markdown an toàn và giữ xử lý XSS hiện có.

## 8. KHÔNG LÀM HỎNG CHỨC NĂNG ĐANG CHẠY

Đây là FE/design migration, không đổi domain hoặc chuẩn kết quả:
- Giữ API contracts, validation và server-side authorization.
- Giữ persistence, attendance rules, knowledge ingestion, citations và audit events.
- Không xóa/reindex tài liệu hoặc reset HR data chỉ để đổi theme.
- Không đổi AI provider/model/key/quota hoặc tự phát sinh batch API calls trả phí vì task giao diện.
- Không chỉnh secrets, migration DB hoặc host Python trừ thay đổi thật sự cần thiết và được giải thích.
- Không bịa dashboard statistics hoặc trạng thái ONLINE/READY/ENROLLED để screenshot đẹp.

Giữ nguyên quyết định: QUÉT MẶT NGƯỜI THẬT Ở CUỐI CÙNG. Hoàn thiện UI/API tích hợp của face module trước, nhưng không yêu cầu người dùng enrollment trong task này. Không tạo embeddings giả; không đánh dấu 3 người đã đăng ký khi chưa có capture thật.

Test doubles chỉ được dùng trong test cô lập; không bật fake success trong runtime. Phần kiểm chứng face thật tiếp tục là PENDING_HUMAN_FACE_TEST, không phải PASS.

## 9. ACCESSIBILITY VÀ RESPONSIVE

Kiểm tra keyboard, focus-visible, tab order, label/error association, Escape để đóng, focus return sau modal và accessible name cho icon-only buttons. Không xóa focus outline mà không có thay thế nhìn rõ.

Kiểm tra contrast thực tế của text/control/status. Không mặc định chữ trắng phù hợp trên success/warning. Giữ source colors nhưng dùng foreground/nền mềm bổ sung đã đo và ghi trong adaptation notes khi cần. Trạng thái có label/icon, không chỉ khác màu.

Kiểm tra 390px, 768px, 1024px và 1440px; bổ sung sát hai phía breakpoint khi phát hiện rủi ro. Đặc biệt không để có khoảng tablet mà cả desktop nav và mobile menu cùng biến mất.

Kiểm tra form/dialog dài, bảng rộng, toolbar nhiều action, chat trên mobile khi bàn phím mở, loading dài và error messages. Tôn trọng reduced motion. Không che nút lưu/hủy hoặc nhãn field.

Giữ UI tiếng Việt, tên miền nghiệp vụ HRM và định dạng ngày/giờ/số hiện có. Không đổi ngôn ngữ sản phẩm sang tiếng Anh để bắt chước website tham khảo.

## 10. TRIỂN KHAI THEO LÁT CẮT NHỎ

1. Audit + xác nhận nguồn mới + cập nhật instruction đang có hiệu lực.
2. Tích hợp HeroUI và theme; kiểm chứng login + app shell + một list/form/modal trước.
3. Chuyển shared primitives rồi toàn bộ route theo inventory.
4. Đồng bộ chart, chatbot, knowledge base, face states và overlays.
5. Quét leftover styles/font/dependencies và sửa regression.
6. Chạy responsive/browser QA, build/test và runtime preview hiện có.

Không dừng sau “đã cài HeroUI” hoặc “đã đổi primary color”. Không dừng để hỏi người dùng chọn các biến thể implementation nhỏ.

## 11. KIỂM CHỨNG VÀ DEFINITION OF DONE

Dùng commands thực tế của repo. Chạy lint, typecheck, build, các test liên quan và runtime preview Cloudflare theo adapter hiện có. Không thay vinext/OpenNext hoặc deploy architecture trong task này.

Kiểm tra tối thiểu:
- Login/logout, role navigation và truy cập trái quyền.
- CRUD/form representative từng loại control; dữ liệu lưu rồi refresh vẫn giữ.
- Chọn ngày/ca, search/filter/sort/pagination và action phê duyệt không regression.
- Dialog/dropdown/tooltip/toast dùng đúng theme kể cả portal.
- HR Copilot và Knowledge Base giữ contract/citation/state đúng; không cần tự gọi hàng loạt API trả phí để kiểm tra màu.
- Face UI có các state đúng, không cần người thật quét ở task này.
- Không có runtime exception, hydration error hoặc style bị mất trên runtime đích do migration.

Chụp ảnh kiểm chứng các trang chính ở các viewport, xem ảnh thực sự và sửa clipping/overflow/spacing; không chỉ kiểm tra DOM tồn tại. Không chụp secrets hoặc dữ liệu nhạy cảm. Nếu môi trường không có browser, báo NOT_VERIFIED cho visual runtime, không khẳng định đã review pixel.

Điều kiện hoàn tất migration:
[ ] reviews.io-design.md là nguồn thiết kế duy nhất đang có hiệu lực.
[ ] getdesign.io-design.md đã xóa khỏi working tree sau khi xác minh file mới.
[ ] AGENTS/master/docs hoạt động không còn yêu cầu áp Get Design hoặc Inter Tight.
[ ] HeroUI được dùng thật cho các primitive hỗ trợ; mọi ngoại lệ có lý do.
[ ] Màu/font/radius/spacing mới áp trên mọi route đã inventory.
[ ] Không còn UI kit cũ làm cùng vai trò sau khi dependency không còn cần thiết.
[ ] Không còn palette đen-hồng-tím cũ đóng vai trò thương hiệu.
[ ] Portals, form states, chart và chatbot không lệch theme.
[ ] Các flow hiện có không bị regression.
[ ] Build/typecheck/test kết quả có bằng chứng; baseline failures phân biệt rõ.
[ ] Visual QA đã chạy hoặc ghi đúng giới hạn chưa kiểm chứng.
[ ] Không thay đổi database/biometric data; human face test vẫn để cuối.

## 12. BÁO CÁO VÀ QUYỀN THỰC THI

Cập nhật docs/PROGRESS.md và một báo cáo ngắn docs/UI_MIGRATION_REPORT.md gồm:
- Stack/HeroUI version thực tế.
- File nguồn thiết kế mới và tài liệu instruction đã cập nhật.
- Token mapping, các app adaptations và ngoại lệ không dùng HeroUI.
- Route/component coverage.
- Test/build/runtime preview kết quả và lỗi còn lại.
- Screenshot paths/viewport đã xem.
- Local URL thật đang chạy; không bịa URL.
- Pending external checks và PENDING_HUMAN_FACE_TEST.

Không sửa backend business logic để che lỗi UI. Không commit/push, không sửa tài nguyên cloud hoặc public deploy mới nếu chưa được cho phép. Nếu môi trường hiện có hỗ trợ deploy trong phạm vi đã được người dùng cấp quyền, báo riêng kết quả thực tế; không đánh đồng local build PASS với online VERIFIED.

BẮT ĐẦU: đọc reviews.io-design.md → audit dự án hiện tại → thay nguồn thiết kế cũ → theme HeroUI → migrate toàn bộ FE → chạy và kiểm chứng. Không chỉ viết kế hoạch.
