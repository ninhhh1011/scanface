"use client";

import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";

import { api, can, ErrorNotice, type Actor } from "./ui";
import { AccountProfile, Dashboard, EmployeeDetail, Reports, ResourcePage, Settings } from "./hr-workspace";
import { specs } from "./resource-specs";
import { FacePanel } from "./face-panel";
import { Assistant, Knowledge } from "./assistant-workspace";
export const navigation = [
  { title: "Nhân sự", links: [["/employees", "Nhân viên"], ["/departments", "Phòng ban"], ["/positions", "Chức danh"], ["/contracts", "Hợp đồng"], ["/documents", "Tài liệu"]] },
  { title: "Công việc", links: [["/attendance", "Chấm công"], ["/shifts", "Ca làm"], ["/schedule", "Lịch làm việc"], ["/timesheets", "Bảng công"], ["/leave", "Nghỉ phép"], ["/overtime", "Tăng ca"], ["/payroll", "Bảng lương"], ["/performance", "Đánh giá"]] },
  { title: "AI", links: [["/assistant", "HR Copilot"], ["/knowledge-base", "Kho tri thức"]] },
  { title: "Quản trị", links: [["/announcements", "Thông báo"], ["/reports", "Báo cáo"], ["/settings/users", "Tài khoản"], ["/settings/roles", "Phân quyền"], ["/audit", "Nhật ký"], ["/settings/attendance", "Thiết lập"]] },
];

function Login({ onLogin }: { onLogin: (actor: Actor) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const data = await api<{ user: Actor }>("/api/auth/me"); onLogin(data.user);
    } catch (e) { setError(e as Error); } finally { setPending(false); }
  }
  return <main className="login-screen"><a className="brand" href="/" aria-label="ABC HRM trang chủ"><span className="brand-mark">a.</span> ABC <span>HRM</span></a><section className="login-card"><span className="eyebrow">Không gian làm việc · Công ty ABC</span><h1>Một ngày mới.<br />Cùng làm việc tốt hơn.</h1><p className="muted">Đăng nhập để quản lý công việc và thông tin nhân sự của bạn.</p><form onSubmit={submit} className="stack"><TextField name="email" type="email" isRequired><Label>Email công việc</Label><Input autoComplete="username" placeholder="ten@congty.vn" /><FieldError /></TextField><TextField name="password" type="password" isRequired><Label>Mật khẩu</Label><Input autoComplete="current-password" /><FieldError /></TextField><ErrorNotice error={error} /><Button type="submit" isPending={pending} fullWidth>{pending ? "Đang đăng nhập…" : "Đăng nhập →"}</Button></form><p className="muted login-help">Cần tài khoản hoặc đặt lại mật khẩu? Liên hệ quản trị viên nội bộ.</p></section><footer>ABC HRM <span>Nhân sự được kết nối.</span></footer></main>;
}

export default function Workspace() {
  const path = usePathname() || "/";
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => { const expired = () => { setActor(null); setMenu(null); }; window.addEventListener("abc:session-expired", expired); return () => window.removeEventListener("abc:session-expired", expired); }, []);
  useEffect(() => { let active = true; api<{ user: Actor }>("/api/auth/me").then(data => { if (active) setActor(data.user); }).catch(e => { if (active && e.status !== 401) setError(e); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function logout() { setLoggingOut(true); try { await api("/api/auth/logout", { method: "POST" }); setActor(null); setMenu(null); } catch (e) { setError(e as Error); } finally { setLoggingOut(false); } }
  if (loading) return <main className="loading-screen" aria-live="polite"><span className="brand-mark">a.</span><p>Đang mở không gian làm việc…</p></main>;
  if (!actor) return <><ErrorNotice error={error} /><Login onLogin={user => { setError(null); setActor(user); }} /></>;
  const resource = ({ "/settings/users": "users", "/settings/roles": "roles", "/settings/attendance": "settings" } as Record<string, string>)[path] || path.split("/")[1];
  function visible(href: string) {
    if (href === "/settings/roles") return actor?.role === "SUPER_ADMIN";
    if (href.startsWith("/settings") || href === "/audit") return can(actor!, "system:manage");
    if (href === "/payroll") return can(actor!, "payroll:read") || !!actor?.employee_id;
    if (["/shifts", "/timesheets"].includes(href)) return can(actor!, "hr:read") || actor?.role === "MANAGER";
    return true;
  }
  const groups = navigation.map(group => ({ ...group, links: group.links.filter(([href]) => visible(href)) })).filter(group => group.links.length);
  const current = groups.flatMap(group => group.links).find(([href]) => path.startsWith(href));
  const title = specs[resource]?.title || current?.[1] || (path === "/profile" ? "Hồ sơ của tôi" : "Tổng quan");
  const employeeDetail = resource === "employees" && path.split("/")[2];
  let content;
  if (employeeDetail) content = <EmployeeDetail id={employeeDetail} actor={actor} />;
  else if (path === "/attendance/scan") content = <FacePanel actor={actor} />;
  else if (path === "/assistant") content = <Assistant />;
  else if (["/knowledge", "/knowledge-base"].includes(path)) content = <Knowledge actor={actor} />;
  else if (path === "/reports") content = <Reports />;
  else if (path === "/profile") content = <AccountProfile actor={actor} />;
  else if (resource === "settings") content = <Settings />;
  else if (specs[resource]) content = <ResourcePage key={resource} resource={resource} actor={actor} />;
  else if (["/", "/dashboard", "/login"].includes(path)) content = <Dashboard />;
  else content = <section className="surface empty-state"><h2>Không tìm thấy trang</h2><a className="text-link" href="/">Về tổng quan →</a></section>;
  return <div className="workspace"><a className="skip-link" href="#main">Đến nội dung chính</a><header className="topbar"><a className="brand" href="/"><span className="brand-mark">a.</span> ABC <span>HRM</span></a><nav aria-label="Điều hướng chính" className="topnav"><a href="/" className={path === "/" || path === "/dashboard" ? "active" : ""}>Tổng quan</a>{groups.map(group => <Button key={group.title} variant="ghost" aria-expanded={menu === group.title} aria-controls="group-navigation" onPress={() => setMenu(menu === group.title ? null : group.title)}>{group.title} <span aria-hidden="true">⌄</span></Button>)}</nav><div className="account"><a className="account-email" href="/profile">{actor.email}</a><a className="mobile-profile" href="/profile" aria-label="Hồ sơ của tôi">Tôi</a><Button variant="secondary" onPress={logout} isPending={loggingOut}>Đăng xuất</Button></div></header>{menu && <nav id="group-navigation" className="groupnav" aria-label={menu}>{groups.find(group => group.title === menu)?.links.map(([href, label]) => <a key={href} href={href} aria-current={path.startsWith(href) ? "page" : undefined}>{label}</a>)}</nav>}<main id="main" className="main-content">{!employeeDetail && <div className="page-heading"><div><span className="eyebrow">Không gian làm việc · Công ty ABC</span><h1>{title}</h1></div><a className="date-label text-link" href="/notifications">Hộp thông báo ↗</a></div>}<ErrorNotice error={error} />{content}</main><footer className="workspace-footer">ABC HRM <span>Giờ Việt Nam · UTC+7</span></footer></div>;
}
