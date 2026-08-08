import { UsersRound } from "lucide-react";
import { StaffAdmin } from "@/components/admin/StaffAdmin";
import { requireAdmin } from "@/app/actions/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export default async function AdminStaffPage() {
  await requireAdmin();

  const staff = db
    .select()
    .from(users)
    .all()
    .filter((u) => u.role === "waiter" || u.role === "cashier");

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent-content">
            <UsersRound className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">إدارة الموظفين</h2>
            <p className="text-sm text-base-content/45">
              فريق واحد يعمل في المطعم والكافيه
            </p>
          </div>
        </div>
      </div>

      <StaffAdmin
        staff={staff.map((person) => ({
          id: person.id,
          name: person.name,
          role: person.role,
          active: person.active,
          isMainCashier: person.isMainCashier,
        }))}
      />
    </div>
  );
}
