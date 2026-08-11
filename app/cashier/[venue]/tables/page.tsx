import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowRight, TableProperties } from "lucide-react";
import { notFound } from "next/navigation";
import { requireMainCashier } from "@/app/actions/auth";
import { TablesAdmin } from "@/components/admin/TablesAdmin";
import { PosHeader } from "@/components/PosHeader";
import { db } from "@/lib/db";
import { tables } from "@/lib/db/schema";
import { compareTableNames } from "@/lib/db/floor-tables";
import { isVenueId } from "@/lib/venues";

export default async function CashierTablesPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();
  const session = await requireMainCashier(venue);

  const rows = db
    .select()
    .from(tables)
    .where(eq(tables.venueId, venue))
    .all()
    .sort((a, b) => compareTableNames(a.name, b.name));

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <PosHeader venueId={venue} name={session.name} roleLabel="كاشير رئيسي" />
      <main className="page-shell flex flex-1 flex-col gap-3 p-2 sm:p-3 lg:p-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <TableProperties className="size-4 shrink-0 text-primary" />
            <h2 className="truncate text-sm font-black">إدارة الطاولات</h2>
          </div>
          <Link
            href={`/cashier/${venue}`}
            className="btn btn-ghost btn-xs h-8 min-h-8 gap-1 rounded-md"
          >
            <ArrowRight className="size-3.5" />
            رجوع
          </Link>
        </div>
        <TablesAdmin
          venueId={venue}
          tables={rows.map((table) => ({
            id: table.id,
            name: table.name,
            active: table.active,
          }))}
        />
      </main>
    </div>
  );
}
