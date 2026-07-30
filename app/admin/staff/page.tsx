import {
  BadgeCheck,
  Plus,
  Power,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { setStaffActive, upsertStaff } from "@/app/actions/admin";
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

      <section className="premium-card card">
        <div className="card-body gap-6 p-5 sm:p-6">
          <div>
            <h3 className="font-black">إضافة موظف جديد</h3>
            <p className="text-xs text-base-content/45">
              أنشئ رمز دخول خاص لكل موظف
            </p>
          </div>
          <form
            action={upsertStaff}
            className="grid gap-3 rounded-2xl bg-base-200/60 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[1fr_180px_220px_auto]"
          >
            <input
              name="name"
              placeholder="الاسم"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <select
              name="role"
              className="select select-bordered w-full bg-base-100"
              required
            >
              <option value="waiter">نادل</option>
              <option value="cashier">كاشير</option>
            </select>
            <input
              name="pin"
              placeholder="رمز PIN (4-6 أرقام)"
              className="input input-bordered w-full bg-base-100"
              pattern="\d{4,6}"
              required
            />
            <button type="submit" className="btn btn-primary gap-2">
              <Plus className="size-4" />
              إضافة
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr
                    key={person.id}
                    className={!person.active ? "opacity-50" : ""}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="avatar avatar-placeholder">
                          <div className="w-9 rounded-xl bg-primary/10 text-primary">
                            <UserRound className="size-4" />
                          </div>
                        </div>
                        <span className="font-bold">{person.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-ghost gap-1.5">
                        {person.role === "waiter" ? (
                          <BadgeCheck className="size-3.5" />
                        ) : (
                          <WalletCards className="size-3.5" />
                        )}
                        {person.role === "waiter" ? "نادل" : "كاشير"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          person.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {person.active ? "نشط" : "معطّل"}
                      </span>
                    </td>
                    <td>
                      <form
                        action={async () => {
                          "use server";
                          await setStaffActive(person.id, !person.active);
                        }}
                      >
                        <button
                          type="submit"
                          className="btn btn-square btn-ghost btn-sm"
                          title={person.active ? "تعطيل" : "تفعيل"}
                        >
                          <Power className="size-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center opacity-60">
                      لا يوجد موظفون بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
