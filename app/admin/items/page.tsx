import { asc, eq } from "drizzle-orm";
import { Boxes, FolderPlus, PackagePlus, Power, Tag } from "lucide-react";
import {
  setCategoryActive,
  setItemActive,
  upsertCategory,
  upsertItem,
} from "@/app/actions/admin";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { categories, items } from "@/lib/db/schema";
import { formatMoney, getVenueName } from "@/lib/venues";

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);

  const cats = db
    .select()
    .from(categories)
    .where(eq(categories.venueId, venue))
    .orderBy(asc(categories.sortOrder))
    .all();

  const allItems = db
    .select()
    .from(items)
    .where(eq(items.venueId, venue))
    .all();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Boxes className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">إدارة الأصناف</h2>
            <p className="text-sm text-base-content/45">
              التصنيفات وقائمة {getVenueName(venue)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/items" venue={venue} />
      </div>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary">
              <Tag className="size-5" />
            </span>
            <div>
              <h3 className="font-black">التصنيفات</h3>
              <p className="text-xs text-base-content/45">
                نظّم الأصناف في مجموعات سهلة
              </p>
            </div>
          </div>
          <form
            action={upsertCategory}
            className="grid gap-3 rounded-2xl bg-base-200/60 p-3 sm:grid-cols-[1fr_140px_auto] sm:p-4"
          >
            <input type="hidden" name="venueId" value={venue} />
            <input
              name="name"
              placeholder="اسم التصنيف"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <input
              name="sortOrder"
              type="number"
              defaultValue={cats.length + 1}
              className="input input-bordered w-full bg-base-100"
              aria-label="ترتيب التصنيف"
            />
            <button type="submit" className="btn btn-primary gap-2">
              <FolderPlus className="size-4" />
              إضافة تصنيف
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الترتيب</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat) => (
                  <tr key={cat.id} className={!cat.active ? "opacity-50" : ""}>
                    <td>{cat.name}</td>
                    <td>{cat.sortOrder}</td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          cat.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {cat.active ? "نشط" : "معطّل"}
                      </span>
                    </td>
                    <td>
                      <form
                        action={async () => {
                          "use server";
                          await setCategoryActive(cat.id, !cat.active);
                        }}
                      >
                        <button
                          type="submit"
                          className="btn btn-square btn-ghost btn-sm"
                          title={cat.active ? "تعطيل" : "تفعيل"}
                        >
                          <Power className="size-4" />
                          <span className="sr-only">
                          {cat.active ? "تعطيل" : "تفعيل"}
                          </span>
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {cats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center opacity-60">
                      لا توجد تصنيفات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Boxes className="size-5" />
            </span>
            <div>
              <h3 className="font-black">قائمة الأصناف</h3>
              <p className="text-xs text-base-content/45">
                أضف الأسعار واربطها بالتصنيفات
              </p>
            </div>
          </div>
          <form
            action={upsertItem}
            className="grid gap-3 rounded-2xl bg-base-200/60 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[1fr_1fr_150px_auto]"
          >
            <input type="hidden" name="venueId" value={venue} />
            <input
              name="name"
              placeholder="اسم الصنف"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <select
              name="categoryId"
              className="select select-bordered w-full bg-base-100"
              required
              defaultValue=""
            >
              <option value="" disabled>
                التصنيف
              </option>
              {cats
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              placeholder="السعر"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <button type="submit" className="btn btn-primary gap-2">
              <PackagePlus className="size-4" />
              إضافة صنف
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>التصنيف</th>
                  <th>السعر</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => {
                  const cat = cats.find((c) => c.id === item.categoryId);
                  return (
                    <tr
                      key={item.id}
                      className={!item.active ? "opacity-50" : ""}
                    >
                      <td>{item.name}</td>
                      <td>{cat?.name ?? "-"}</td>
                      <td>{formatMoney(item.price)}</td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            item.active
                              ? "badge-success badge-soft"
                              : "badge-ghost"
                          }`}
                        >
                          {item.active ? "نشط" : "معطّل"}
                        </span>
                      </td>
                      <td>
                        <form
                          action={async () => {
                            "use server";
                            await setItemActive(item.id, !item.active);
                          }}
                        >
                          <button
                            type="submit"
                            className="btn btn-square btn-ghost btn-sm"
                            title={item.active ? "تعطيل" : "تفعيل"}
                          >
                            <Power className="size-4" />
                            <span className="sr-only">
                            {item.active ? "تعطيل" : "تفعيل"}
                            </span>
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {allItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center opacity-60">
                      لا توجد أصناف بعد
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
