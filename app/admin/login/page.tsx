import { redirect } from "next/navigation";
import { BarChart3, Boxes, Sparkles, UsersRound } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const session = await getSession();
  const { reset } = await searchParams;

  if (session?.role === "admin") redirect("/admin");
  if (session?.role === "waiter" || session?.role === "cashier") {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-dvh flex-1 overflow-hidden p-4 sm:p-6 lg:p-10">
      <div className="pointer-events-none absolute -right-32 top-20 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-0 size-96 rounded-full bg-secondary/10 blur-3xl" />
      <div className="page-shell relative z-10 grid flex-1 items-center gap-12 lg:grid-cols-[1fr_440px]">
        <section className="hidden lg:block">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="text-xl font-black">فاست بوس</p>
              <p className="text-xs text-base-content/45">لوحة تحكم ذكية</p>
            </div>
          </div>
          <h2 className="max-w-2xl text-5xl font-black leading-[1.25]">
            كل ما تحتاجه لإدارة عملك
            <span className="text-primary"> من مكان واحد</span>
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-base-content/55">
            تابع المبيعات، نظّم الأصناف، وأدر فريقك بسهولة من لوحة مصممة
            لتمنحك صورة واضحة وسريعة.
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {[
              { icon: BarChart3, label: "تقارير واضحة" },
              { icon: Boxes, label: "إدارة الأصناف" },
              { icon: UsersRound, label: "إدارة الفريق" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="premium-card rounded-2xl p-4 text-center"
              >
                <Icon className="mx-auto mb-2 size-5 text-primary" />
                <p className="text-sm font-bold">{label}</p>
              </div>
            ))}
          </div>
        </section>
        <AdminLoginForm resetNotice={reset === "1"} />
      </div>
    </main>
  );
}
