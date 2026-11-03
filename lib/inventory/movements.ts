import { parseId } from "@/lib/reports/filters";

export type MovementFilterInput = {
  item?: string;
  category?: string;
};

export type MovementFilters = {
  item: string;
  categoryId: number | null;
};

export function resolveMovementFilters(
  input: MovementFilterInput,
): MovementFilters {
  return {
    item: (input.item ?? "").trim(),
    categoryId: parseId(input.category),
  };
}
