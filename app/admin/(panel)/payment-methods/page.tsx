import { asc, isNotNull, sql } from "drizzle-orm";
import { WalletCards } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  PaymentMethodsAdmin,
  type PaymentMethodAdminRow,
} from "@/components/admin/PaymentMethodsAdmin";
import { db } from "@/lib/db";
import { orders, paymentMethods } from "@/lib/db/schema";

export default async function AdminPaymentMethodsPage() {
  await requireAdmin();

  const rows = db
    .select()
    .from(paymentMethods)
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.id))
    .all();

  const usageRows = db
    .select({
      code: orders.paymentMethod,
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(isNotNull(orders.paymentMethod))
    .groupBy(orders.paymentMethod)
    .all();
  const usage = new Map(
    usageRows.map((row) => [row.code, Number(row.total)]),
  );

  const methods: PaymentMethodAdminRow[] = rows.map((method) => ({
    id: method.id,
    code: method.code,
    name: method.name,
    deferred: method.deferred,
    cashDrawer: method.cashDrawer,
    builtIn: method.builtIn,
    active: method.active,
    usageCount: usage.get(method.code) ?? 0,
  }));

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <WalletCards className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">طرق الدفع</h2>
          <p className="text-sm text-base-content/45">
            أضف طرق الدفع المتاحة وحدد أيها يؤثر على النقد المتوقع في الوردية
          </p>
        </div>
      </div>

      <PaymentMethodsAdmin methods={methods} />
    </div>
  );
}
