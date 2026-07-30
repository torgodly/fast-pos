import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  Banknote,
  Boxes,
  Clock3,
  Sparkles,
  TableProperties,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { db } from "@/lib/db";
import { items, orders, tables, users } from "@/lib/db/schema";
import { formatMoney } from "@/lib/venues";

export default async function AdminHomePage() {
  await requireAdmin();

  const openOrders = db
    .select()
    .from(orders)
    .where(eq(orders.status, "open"))
    .all().length;
  const paidToday = db
    .select()
    .from(orders)
    .where(eq(orders.status, "paid"))
    .all();
  const salesTotal = paidToday.reduce((s, o) => s + o.total, 0);
  const itemCount = db.select().from(items).all().length;
  const tableCount = db.select().from(tables).all().length;
  const staffCount = db
    .select()
    .from(users)
    .all()
    .filter((u) => u.role !== "admin").length;

  const cards = [
    {
      label: "إجمالي المبيعات",
      value: formatMoney(salesTotal),
      hint: `${paidToday.length} فاتورة مدفوعة`,
      href: "/admin/reports",
      icon: Banknote,
      color: "text-primary bg-primary/10",
    },
    {
      label: "فواتير مفتوحة",
      value: String(openOrders),
      hint: "بانتظار التحصيل",
      href: "/admin/reports",
      icon: Clock3,
      color: "text-warning bg-warning/15",
    },
    {
      label: "الأصناف",
      value: String(itemCount),
      hint: "في المطعم والكافيه",
      href: "/admin/items",
      icon: Boxes,
      color: "text-secondary bg-secondary/10",
    },
    {
      label: "الطاولات",
      value: String(tableCount),
      hint: "إجمالي الطاولات",
      href: "/admin/tables",
      icon: TableProperties,
      color: "text-info bg-info/10",
    },
    {
      label: "الموظفون",
      value: String(staffCount),
      hint: "نادل وكاشير",
      href: "/admin/staff",
      icon: UsersRound,
      color: "text-accent-content bg-accent/15",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-neutral via-slate-800 to-primary p-6 text-neutral-content shadow-2xl shadow-primary/10 sm:p-8">
        <div className="absolute -left-16 -top-20 size-64 rounded-full border-[35px] border-white/5" />
        <div className="absolute -bottom-28 right-1/3 size-64 rounded-full bg-white/5" />
        <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <div className="badge border-white/15 bg-white/10 text-white">
              <Sparkles className="size-3.5" />
              نظرة عامة
            </div>
            <h2 className="mt-4 text-3xl font-black sm:text-4xl">صباح الخير!</h2>
            <p className="mt-2 max-w-lg text-sm leading-7 text-white/65 sm:text-base">
              هذه لوحة أداء عملك. راقب المبيعات والفواتير وأدر عملياتك بسرعة
              من هنا.
            </p>
          </div>
          <Link
            href="/admin/reports"
            className="btn border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/20"
          >
            <TrendingUp className="size-4" />
            عرض التقارير
          </Link>
        </div>
      </section>

      <div>
        <h3 className="text-xl font-black">ملخص النشاط</h3>
        <p className="mt-1 text-sm text-base-content/45">
          كل الأرقام المهمة في مكان واحد
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="premium-card group card transition duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg"
          >
            <div className="card-body gap-4 p-5 sm:p-6">
              <div className="flex items-start justify-between">
                <span className={`grid size-11 place-items-center rounded-2xl ${card.color}`}>
                  <card.icon className="size-5" />
                </span>
                <ArrowLeft className="size-4 text-base-content/25 transition group-hover:-translate-x-1 group-hover:text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-base-content/50">
                  {card.label}
                </p>
                <p className="mt-1 text-3xl font-black tracking-tight">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-base-content/40">{card.hint}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
