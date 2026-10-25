"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  BarChart3,
  Boxes,
  ClipboardList,
  Clock3,
  Contact,
  LayoutDashboard,
  LogOut,
  Printer,
  ReceiptText,
  Ruler,
  ShieldCheck,
  Settings2,
  ShoppingCart,
  Sparkles,
  TableProperties,
  Truck,
  UsersRound,
  WalletCards,
  Warehouse,
} from "lucide-react";
import { LogoutButton, LogoutIconButton } from "@/components/LogoutButton";

const links = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/items", label: "الأصناف", icon: Boxes },
  { href: "/admin/tables", label: "الطاولات", icon: TableProperties },
  { href: "/admin/staff", label: "الموظفون", icon: UsersRound },
  { href: "/admin/printers", label: "الطابعات", icon: Printer },
  { href: "/admin/inventory", label: "المخزون", icon: Warehouse },
  { href: "/admin/units", label: "وحدات القياس", icon: Ruler },
  { href: "/admin/suppliers", label: "الموردون", icon: Truck },
  { href: "/admin/customers", label: "العملاء", icon: Contact },
  { href: "/admin/payment-methods", label: "طرق الدفع", icon: WalletCards },
  { href: "/admin/purchases", label: "فواتير المشتريات", icon: ShoppingCart },
  { href: "/admin/reports", label: "التقارير", icon: BarChart3 },
  { href: "/admin/shifts", label: "الورديات", icon: Clock3 },
  { href: "/admin/invoices", label: "الفواتير", icon: ReceiptText },
  { href: "/admin/cancelled-items", label: "الأصناف الملغاة", icon: Ban },
  { href: "/admin/audit", label: "التدقيق", icon: ClipboardList },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings2 },
  { href: "/admin/activation", label: "التفعيل", icon: ShieldCheck },
];

export function AdminNav({
  name,
  counterMode = false,
}: { name: string; counterMode?: boolean }) {
  const pathname = usePathname();

  const visibleLinks = counterMode
    ? links.filter((link) => link.href !== "/admin/tables")
    : links;

  return (
    <aside className="z-30 flex w-full shrink-0 flex-col border-b border-base-300/60 bg-base-100/90 p-3 backdrop-blur-xl lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:overflow-hidden lg:border-b-0 lg:border-l lg:p-5">
      <div className="flex shrink-0 items-center justify-between lg:block">
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

      <div className="mobile-scroll-x mt-3 min-h-0 lg:mt-8 lg:flex-1 lg:overflow-y-auto lg:overflow-x-visible">
        <nav className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col lg:gap-1.5">
          {visibleLinks.map((link) => {
            const active =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold transition lg:px-4 lg:py-3 ${
                  active
                    ? "bg-primary text-primary-content shadow-md shadow-primary/15"
                    : "text-base-content/55 hover:bg-base-200 hover:text-base-content"
                }`}
              >
                <link.icon className="size-4.5" strokeWidth={2} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-3 shrink-0 border-t border-base-300/60 pt-3 lg:mt-auto lg:pt-4">
        <div className="mb-3 rounded-2xl bg-base-200/70 p-3.5">
          <p className="text-xs text-base-content/45">تم تسجيل الدخول باسم</p>
          <p className="mt-0.5 font-bold">{name}</p>
        </div>
        <LogoutButton className="btn btn-ghost w-full justify-start gap-3 rounded-xl text-error">
          <LogOut className="size-4.5" />
          تسجيل الخروج
        </LogoutButton>
      </div>
    </aside>
  );
}
