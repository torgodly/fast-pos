import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "فاست بوس | نظام نقاط البيع",
  description: "نظام نقاط البيع للمطعم والكافيه",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-base-200 font-sans text-base-content antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
