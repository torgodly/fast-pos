"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Printer,
  RotateCcw,
  Settings2,
  Sparkles,
  TableProperties,
  UsersRound,
} from "lucide-react";
import { FactoryResetPanel } from "@/components/FactoryResetPanel";
import { LogoutButton, LogoutIconButton } from "@/components/LogoutButton";

const links = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/items", label: "الأصناف", icon: Boxes },
  { href: "/admin/tables", label: "الطاولات", icon: TableProperties },
  { href: "/admin/staff", label: "الموظفون", icon: UsersRound },
  { href: "/admin/printers", label: "الطابعات", icon: Printer },
  { href: "/admin/reports", label: "التقارير", icon: BarChart3 },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings2 },
];

export function AdminNav({ name }: { name: string }) {
  const pathname = usePathname();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"sales" | "full">("sales");

  function openReset(mode: "sales" | "full") {
    setResetMode(mode);
    setResetOpen(true);
  }

  return (
    <aside className="z-30 flex w-full shrink-0 flex-col border-b border-base-300/60 bg-base-100/90 p-3 backdrop-blur-xl lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:border-b-0 lg:border-l lg:p-5">
      <div className="flex items-center justify-between lg:block">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-black leading-tight">فاست بوس</h1>
            <p className="text-xs text-base-content/45">لوحة الإدارة</p>
          </div>
        </div>
        <LogoutIconButton className="btn btn-circle btn-ghost btn-sm text-base-content/55 lg:hidden" />
      </div>

      <div className="mobile-scroll-x mt-3 lg:mt-8 lg:overflow-visible">
        <nav className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col lg:gap-1.5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition lg:px-4 lg:py-3 ${
              pathname === link.href
                ? "bg-primary text-primary-content shadow-md shadow-primary/15"
                : "text-base-content/55 hover:bg-base-200 hover:text-base-content"
            }`}
          >
            <link.icon className="size-4.5" strokeWidth={2} />
            {link.label}
          </Link>
        ))}
        </nav>
      </div>

      <div className="mt-4 border-t border-base-300/60 pt-3 lg:mt-auto lg:border-t-0 lg:pt-0">
        <div className="mb-3 hidden rounded-2xl bg-base-200/70 p-3.5 lg:block">
          <p className="text-xs text-base-content/45">تم تسجيل الدخول باسم</p>
          <p className="mt-0.5 font-bold">{name}</p>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-error btn-sm mb-2 w-full justify-start gap-2 rounded-xl"
          onClick={() => openReset("sales")}
        >
          <RotateCcw className="size-4" />
          حذف جميع المبيعات
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs mb-2 w-full justify-start text-base-content/45"
          onClick={() => openReset("full")}
        >
          تهيئة متقدمة (طابعات، موظفون…)
        </button>
        <LogoutButton className="btn btn-ghost w-full justify-start gap-3 rounded-xl text-error">
          <LogOut className="size-4.5" />
          تسجيل الخروج
        </LogoutButton>
        <FactoryResetPanel
          open={resetOpen}
          mode={resetMode}
          onClose={() => setResetOpen(false)}
        />
      </div>
    </aside>
  );
}
