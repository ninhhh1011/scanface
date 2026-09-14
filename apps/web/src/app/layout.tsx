import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "ABC HRM · Không gian nhân sự", description: "Quản lý nhân sự, công việc và chấm công tại Công ty ABC." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi" className="light" data-theme="light"><body>{children}</body></html>;
}
