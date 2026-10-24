import { asc, sql } from "drizzle-orm";
import { Contact } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  CustomersAdmin,
  type CustomerRow,
} from "@/components/admin/CustomersAdmin";
import { db } from "@/lib/db";
import { customers, orders } from "@/lib/db/schema";

export default async function AdminCustomersPage() {
  await requireAdmin();

  const rows = db
    .select()
    .from(customers)
    .orderBy(asc(customers.name), asc(customers.id))
    .all();

  const counts = db
    .select({
      customerId: orders.customerId,
      count: sql<number>`count(*)`,
    })
    .from(orders)
    .groupBy(orders.customerId)
    .all();

  const countsByCustomer = new Map<number, number>();
  for (const row of counts) {
    if (row.customerId != null) {
      countsByCustomer.set(row.customerId, Number(row.count));
    }
  }

  const customerRows: CustomerRow[] = rows.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    notes: customer.notes,
    active: customer.active,
    ordersCount: countsByCustomer.get(customer.id) ?? 0,
  }));

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-info/10 text-info">
          <Contact className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">العملاء</h2>
          <p className="text-sm text-base-content/45">
            عملاء الفواتير والإيصالات — يُختارون من شاشة البيع السريع
          </p>
        </div>
      </div>

      <CustomersAdmin customers={customerRows} />
    </div>
  );
}
