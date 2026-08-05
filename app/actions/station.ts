"use server";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { authCookieOptions } from "@/lib/auth/cookie-options";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cashierStations, printers } from "@/lib/db/schema";
import { isVenueId } from "@/lib/venues";
import type { VenueId } from "@/lib/types";

function cookieName(venueId: string) {
  return `pos_station_${venueId}`;
}

export async function getSelectedStationId(
  venueId: string,
): Promise<number | null> {
  if (!isVenueId(venueId)) return null;
  const store = await cookies();
  const raw = store.get(cookieName(venueId))?.value;
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function getCashierStationContext(
  venueId: string,
): Promise<
  | { error: string }
  | {
      station: typeof cashierStations.$inferSelect;
      printer: typeof printers.$inferSelect;
    }
> {
  const stationId = await getSelectedStationId(venueId);
  if (!stationId || !isVenueId(venueId)) {
    return { error: "اختر محطة الكاشير أولاً" };
  }

  const station = db
    .select()
    .from(cashierStations)
    .where(
      and(
        eq(cashierStations.id, stationId),
        eq(cashierStations.venueId, venueId),
        eq(cashierStations.active, true),
      ),
    )
    .get();

  if (!station) {
    return { error: "محطة الكاشير غير صالحة — اختر محطة أخرى" };
  }

  const printer = db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.id, station.printerId),
        eq(printers.role, "checkout"),
        eq(printers.active, true),
      ),
    )
    .get();

  if (!printer) {
    return {
      error: `محطة ${station.name} بدون طابعة فاتورة نشطة`,
    };
  }

  return { station, printer };
}

export async function selectCashierStation(venueId: string, stationId: number) {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }

  const station = db
    .select()
    .from(cashierStations)
    .where(
      and(
        eq(cashierStations.id, stationId),
        eq(cashierStations.venueId, venueId as VenueId),
        eq(cashierStations.active, true),
      ),
    )
    .get();

  if (!station) {
    return { error: "المحطة غير موجودة" };
  }

  const store = await cookies();
  store.set(
    cookieName(venueId),
    String(stationId),
    authCookieOptions(60 * 60 * 24 * 30),
  );

  revalidatePath(`/cashier/${venueId}`);
  revalidatePath(`/cashier/${venueId}/quick`);
  return { ok: true as const };
}

export async function clearCashierStation(venueId: string) {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  const store = await cookies();
  store.delete(cookieName(venueId));
  revalidatePath(`/cashier/${venueId}`);
  return { ok: true as const };
}
