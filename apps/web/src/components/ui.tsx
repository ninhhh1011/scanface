"use client";

import { Button, FieldError, Input, Label, ListBox, Modal, Select, TextArea, TextField } from "@heroui/react";
import { useEffect, useState, type ReactNode } from "react";

export type Actor = { id: string; email: string; role: string; employee_id: string | null; capabilities: string[] };
export type Row = Record<string, unknown> & { id?: string };
export type PageData = { items: Row[]; total: number; page: number; page_size: number };
export type Options = Record<string, Row[]>;
export const can = (actor: Actor, capability: string) => actor.role === "SUPER_ADMIN" || actor.capabilities.includes(capability);
export class ApiError extends Error { constructor(public code: string, message: string, public status: number, public fields?: Record<string, string[] | string>) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) { if (response.status === 401 && path !== "/api/auth/login" && typeof window !== "undefined") window.dispatchEvent(new Event("abc:session-expired")); throw new ApiError(data?.error?.code || "REQUEST_FAILED", data?.error?.message || "Không thể kết nối dịch vụ. Vui lòng thử lại.", response.status, data?.error?.fields); }
  return data as T;
}
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export function useData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState<Error | null>(null), [loading, setLoading] = useState(true), [version, setVersion] = useState(0);
  useEffect(() => { const controller = new AbortController(); setData(null); setError(null); setLoading(true); if (!url) { setLoading(false); return; } api<T>(url, { signal: controller.signal }).then(setData).catch(e => { if (e.name !== "AbortError") setError(e); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [url, version]);
  return { data, error, loading, refresh: () => setVersion(v => v + 1) };
}
export function ErrorNotice({ error }: { error: Error | null }) {
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : "";
  const messages: Record<string, string> = { RECORD_CONFLICT: "Dữ liệu bị trùng, trùng lịch hoặc vi phạm ràng buộc. Vui lòng kiểm tra bản ghi và khoảng ngày.", GRANT_BELOW_USED: "Định mức mới không thể thấp hơn số ngày phép đã sử dụng.", BALANCE_PERIOD_IMMUTABLE: "Không thể đổi nhân viên, loại nghỉ hoặc năm của số dư đã tạo.", LEAVE_RANGE_EXCEEDS_POLICY: "Khoảng nghỉ vượt số ngày tối đa trong chính sách hiện tại.", SESSION_REVOKED: "Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.", PERMISSION_DENIED: "Tài khoản của bạn không có quyền truy cập dữ liệu hoặc thực hiện thao tác này.", AI_NOT_CONFIGURED: "Trợ lý AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.", SERVICE_UNAVAILABLE: "Dịch vụ tạm thời không sẵn sàng. Vui lòng thử lại sau.", AUTH_REQUIRED: "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.", INVALID_CREDENTIALS: "Email hoặc mật khẩu chưa đúng.", INVALID_PASSWORD: "Mật khẩu phải có từ 12 đến 128 ký tự.", SELF_APPROVAL_DENIED: "Bạn không thể tự duyệt yêu cầu của mình.", TIMESHEET_LOCKED: "Kỳ công đã khóa. Người có quyền cần mở lại trước khi thay đổi.", PAYROLL_LOCKED: "Kỳ lương liên quan đã khóa. Cần mở lại kỳ lương trước.", DRAFT_REQUIRED: "Chỉ có thể chỉnh sửa bản nháp.", INVALID_TRANSITION: "Trạng thái bản ghi đã thay đổi hoặc chưa đáp ứng bước xử lý này. Hãy làm mới dữ liệu.", INVALID_DATE_RANGE: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.", ALREADY_CHECKED_IN: "Nhân viên đã vào ca và chưa ra ca.", CHECK_IN_REQUIRED: "Cần chấm công vào ca trước khi ra ca.", CHECK_OUT_BEFORE_IN: "Giờ ra ca không thể trước giờ vào ca.", NO_ACTIVE_SHIFT: "Chưa có lịch ca phù hợp ở thời điểm này. Vui lòng kiểm tra phân ca.", SHIFT_ALREADY_RECORDED: "Ca làm này đã có bản ghi chấm công.", CORRECTION_REQUIRED: "Bản ghi cũ cần được xử lý bằng yêu cầu điều chỉnh công.", EMPLOYEE_NOT_ACTIVE: "Hồ sơ nhân viên hiện không ở trạng thái hoạt động.", EMPLOYEE_ARCHIVED: "Hồ sơ nhân viên đã được lưu trữ.", INSUFFICIENT_LEAVE_BALANCE: "Số dư nghỉ phép không đủ cho yêu cầu này.", LEAVE_SCHEDULE_REQUIRED: "Cần phân ca đầy đủ cho khoảng ngày xin nghỉ trước khi tạo đơn.", NO_WORKDAYS: "Khoảng ngày đã chọn không có ngày làm việc theo lịch.", SPLIT_LEAVE_BY_YEAR: "Vui lòng tách đơn nghỉ theo từng năm.", INVALID_OT_RANGE: "Khung giờ tăng ca phải có giờ kết thúc sau giờ bắt đầu và không quá 16 giờ.", OT_OVERLAPS_REGULAR_SHIFT: "Khung giờ tăng ca trùng với giờ làm việc thông thường.", REASON_REQUIRED: "Vui lòng nhập lý do có ít nhất 3 ký tự.", MISSING_CHECKOUT: "Kỳ công còn bản ghi chưa ra ca. Hãy rà soát trước khi khóa.", LOCKED_TIMESHEET_REQUIRED: "Cần khóa bảng công trước khi tính lương.", CALCULATE_REQUIRED: "Cần tính lương trước khi rà soát kỳ lương.", REVIEW_INCOMPLETE: "Cần hoàn tất nhận xét quản lý và điểm đánh giá trước khi công bố.", SHIFT_IN_USE_CREATE_NEW: "Ca đã được sử dụng trong chấm công. Hãy tạo ca mới để bảo toàn lịch sử.", INVALID_ATTENDANCE: "Bản ghi chấm công không thuộc nhân viên đã chọn.", KNOWLEDGE_NOT_READY: "Phiên bản chưa xử lý xong hoặc chưa nằm trong thời gian hiệu lực.", JOB_IN_PROGRESS: "Tài liệu đang được xử lý. Hãy chờ hoàn tất trước khi lập chỉ mục lại.", UNSUPPORTED_FILE_OR_SIZE: "Tệp không đúng định dạng, trống hoặc vượt quá 10 MB.", FILE_TYPE_MISMATCH: "Nội dung tệp không khớp với định dạng đã chọn.", INVALID_CONTRACT: "Hợp đồng không thuộc nhân viên đã chọn.", RATE_LIMITED: "Bạn đã thực hiện nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau.", SELF_ADMIN_CHANGE_DENIED: "Không thể tự thay đổi quyền hoặc khóa tài khoản đang sử dụng.", VALIDATION_ERROR: "Vui lòng kiểm tra các trường dữ liệu được đánh dấu.", KNOWLEDGE_FILE_IN_USE: "Tài liệu thuộc kho tri thức. Hãy quản lý hoặc xóa từ màn Kho tri thức." };
  const message = messages[code] || (/^[A-Z_]+$/.test(error.message) ? "Dữ liệu hoặc trạng thái hiện tại chưa phù hợp. Vui lòng kiểm tra lại thông tin và thử lại." : error.message);
  return <div role="alert" className="notice error"><strong>{/CONFIGURED|CONFIGURATION|UNAVAILABLE/.test(code) ? "Dịch vụ chưa sẵn sàng" : /PERMISSION|FORBIDDEN/.test(code) ? "Bạn không có quyền thực hiện" : "Không thể hoàn tất"}</strong><p>{message}</p></div>;
}
export function DataState({ loading, error, empty = false, children }: { loading: boolean; error: Error | null; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="empty-state" role="status"><span className="status-dot" /><p className="muted">Đang tải dữ liệu…</p></div>;
  if (error) return <ErrorNotice error={error} />;
  if (empty) return <div className="empty-state"><span className="empty-symbol">↗</span><h2>Chưa có bản ghi</h2><p className="muted">Thử thay đổi bộ lọc hoặc tạo bản ghi đầu tiên.</p></div>;
  return children;
}
export const labels: Record<string, string> = { ACTIVE: "Đang hoạt động", ON_LEAVE: "Đang nghỉ", ARCHIVED: "Đã lưu trữ", DRAFT: "Bản nháp", PENDING: "Chờ duyệt", SUBMITTED: "Đã gửi", APPROVED: "Đã duyệt", REJECTED: "Từ chối", CANCELLED: "Đã hủy", REVIEW: "Đang rà soát", REVIEWED: "Đã rà soát", LOCKED: "Đã khóa", CALCULATED: "Đã tính", PUBLISHED: "Đã công bố", EXPIRED: "Hết hạn", TERMINATED: "Đã chấm dứt", READY: "Sẵn sàng", QUEUED: "Chờ xử lý", PROCESSING: "Đang xử lý", FAILED: "Xử lý lỗi", UPLOADED: "Đã tải lên", INACTIVE: "Ngừng sử dụng", ENROLLED: "Đã đăng ký", NOT_ENROLLED: "Chưa đăng ký", SEED: "Dữ liệu mẫu", MANUAL: "Nhập thủ công", FACE: "Khuôn mặt", GENERAL: "Thông thường", CONFIDENTIAL: "Bảo mật", IDENTITY: "Giấy tờ cá nhân", SUPER_ADMIN: "Quản trị hệ thống", HR_ADMIN: "Quản trị nhân sự", MANAGER: "Quản lý", EMPLOYEE: "Nhân viên", BASE: "Lương cơ bản", ALLOWANCE: "Phụ cấp", ADJUSTMENT: "Điều chỉnh", CHECK_IN: "Vào ca", CHECK_OUT: "Ra ca" };
export const roles = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"];
export const str = (value: unknown) => value === null || value === undefined ? "" : String(value);
export function format(value: unknown, field = "", options: Options = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const relation = ({ employee_id: "employees", manager_id: "employees", department_id: "departments", position_id: "positions", shift_id: "shifts", type_id: "leave_types", cycle_id: "review_cycles", timesheet_id: "timesheets" } as Record<string, string>)[field];
  if (relation) { const item = options[relation]?.find(row => row.id === value); if (item) return str(item.full_name || item.name || item.code); }
  if (Array.isArray(value)) return value.map(v => labels[str(v)] || str(v)).join(", ");
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (/(amount|salary)$/.test(field) && /^-?\d+$/.test(str(value))) return BigInt(str(value)).toLocaleString("vi-VN") + " ₫";
  if (/^(start_minute|end_minute)$/.test(field)) return `${Math.floor(Number(value) / 60).toString().padStart(2, "0")}:${(Number(value) % 60).toString().padStart(2, "0")}`;
  if (/^\d{4}-\d\d-\d\d(T.*)?$/.test(str(value))) { const date = new Date(str(value)); if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", ...(/(_at|check_in|check_out|requested_in|requested_out)$/.test(field) ? { timeStyle: "short" as const } : {}), timeZone: "Asia/Ho_Chi_Minh" }).format(date); }
  return typeof value === "object" ? "—" : labels[str(value)] || str(value);
}
export function Status({ value }: { value: unknown }) {
  const v = str(value);
  const variant = ["ACTIVE", "APPROVED", "READY", "ENROLLED", "PUBLISHED", "REVIEWED", "CALCULATED"].includes(v)
    ? "positive"
    : ["FAILED", "REJECTED", "TERMINATED", "CANCELLED", "EXPIRED", "INACTIVE"].includes(v)
    ? "negative"
    : ["PENDING", "SUBMITTED", "REVIEW", "PROCESSING", "QUEUED"].includes(v)
    ? "warning"
    : "neutral";
  return <span className={`status ${variant}`}>{format(value)}</span>;
}
export function Choice({ name, label, value, onChange, items, required = false, multiple = false }: { name?: string; label: string; value: string | string[]; onChange: (value: string | string[]) => void; items: { id: string; label: string }[]; required?: boolean; multiple?: boolean }) {
  return <Select name={name} selectionMode={multiple ? "multiple" : "single"} value={value || null} onChange={v => onChange(Array.isArray(v) ? v.map(String) : v === null ? "" : String(v))} isRequired={required} placeholder="Chọn…" fullWidth><Label>{label}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger><Select.Popover><ListBox>{items.map(item => <ListBox.Item id={item.id} key={item.id} textValue={item.label}>{item.label}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover><FieldError /></Select>;
}
export function TextControl({ name, label, value, onChange, type = "text", required = false, error, min, max }: { name?: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; error?: string; min?: number; max?: number }) {
  return <TextField name={name} value={value} onChange={onChange} isRequired={required} isInvalid={!!error}><Label>{label}</Label>{type === "textarea" ? <TextArea rows={4} /> : <Input type={type} min={min} max={max} />}<FieldError>{error}</FieldError></TextField>;
}
export function Dialog({ title, open, onClose, children, footer }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return <Modal isOpen={open} onOpenChange={isOpen => { if (!isOpen) onClose(); }}><Modal.Backdrop><Modal.Container size="lg" scroll="inside"><Modal.Dialog><Modal.CloseTrigger aria-label="Đóng" /><Modal.Header><Modal.Heading>{title}</Modal.Heading></Modal.Header><Modal.Body>{children}</Modal.Body>{footer && <Modal.Footer>{footer}</Modal.Footer>}</Modal.Dialog></Modal.Container></Modal.Backdrop></Modal>;
}
export async function download(url: string, filename: string) { const response = await fetch(url, { credentials: "same-origin", cache: "no-store" }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(data.error?.code || "DOWNLOAD_FAILED", data.error?.message || "Không thể tải tệp.", response.status); } const blob = await response.blob(); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 1000); }
export function useDirty(dirty: boolean) { useEffect(() => { if (!dirty) return; const handle = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", handle); return () => window.removeEventListener("beforeunload", handle); }, [dirty]); }
export function csvCell(value: string) { return `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`; }
export function exportRows(rows: Row[], columns: { key: string; label: string }[], options: Options, filename: string) {
  const csv = "\uFEFF" + [columns.map(column => csvCell(column.label)).join(","), ...rows.map(row => columns.map(column => csvCell(format(row[column.key], column.key, options))).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Confirm({ title, description, onConfirm, onClose, reasonRequired = false, password = false }: { title: string; description: string; onConfirm: (reason: string) => Promise<void>; onClose: () => void; reasonRequired?: boolean; password?: boolean }) {
  const [reason, setReason] = useState(""), [pending, setPending] = useState(false), [error, setError] = useState<Error | null>(null);
  return <Dialog title={title} open onClose={() => { if (!pending) onClose(); }}><form className="stack" onSubmit={async e => { e.preventDefault(); setPending(true); setError(null); try { await onConfirm(reason); onClose(); } catch (e) { setError(e as Error); } finally { setPending(false); } }}><p className="muted">{description}</p>{(reasonRequired || password) && <TextControl label={password ? "Mật khẩu mới" : "Lý do"} value={reason} onChange={setReason} required type={password ? "password" : "textarea"} />}<ErrorNotice error={error} /><div className="form-actions"><Button variant="secondary" onPress={onClose} isDisabled={pending}>Hủy</Button><Button type="submit" isPending={pending}>{title}</Button></div></form></Dialog>;
}
