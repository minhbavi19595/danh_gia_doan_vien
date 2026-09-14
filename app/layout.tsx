import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import ToastContainer from "@/components/Toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Đánh giá Đoàn viên",
  description: "Hệ thống quản lý và đánh giá đoàn viên trung tâm",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <ToastProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          <ToastContainer />
        </ToastProvider>
      </body >
    </html>
  );
}

