import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, items } from "@/lib/db/schema";

/** Category name at sale time — used so reports survive item/category deletes. */
export function categoryNameForItem(itemId: number): string | null {
  const row = db
    .select({ name: categories.name })
    .from(items)
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(eq(items.id, itemId))
    .get();
  const name = row?.name?.trim();
  return name || null;
}
