"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MonitorSmartphone } from "lucide-react";
import {
  clearCashierStation,
  selectCashierStation,
} from "@/app/actions/station";

type Station = {
  id: number;
  name: string;
  printerName: string;
  printerHost: string;
};

export function StationPicker({
  venueId,
  stations,
  selectedStationId,
}: {
  venueId: string;
  stations: Station[];
  selectedStationId: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(stationId: number) {
    startTransition(async () => {
      await selectCashierStation(venueId, stationId);
      router.refresh();
    });
  }

  function change() {
    startTransition(async () => {
      await clearCashierStation(venueId);
      router.refresh();
    });
  }

  const selected = stations.find((s) => s.id === selectedStationId) ?? null;

  if (selected) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <MonitorSmartphone className="size-5" />
          </span>
          <div>
            <p className="text-xs text-white/60">المحطة الحالية</p>
            <p className="font-black">{selected.name}</p>
            <p className="text-xs text-white/55">
              طابعة: {selected.printerName} ({selected.printerHost})
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm border-white/20 bg-white/10 text-white hover:bg-white/20"
          disabled={pending}
          onClick={change}
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          تغيير المحطة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
      <div>
        <p className="font-black text-warning-content">اختر محطة الكاشير</p>
        <p className="text-sm text-base-content/60">
          يجب اختيار المحطة قبل التحصيل أو البيع السريع لطباعة الفاتورة على
          الطابعة الصحيحة
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((station) => (
          <button
            key={station.id}
            type="button"
            disabled={pending}
            onClick={() => choose(station.id)}
            className="btn h-auto min-h-16 flex-col items-start gap-1 rounded-2xl border-base-300 bg-base-100 px-4 py-3 text-right"
          >
            <span className="font-black">{station.name}</span>
            <span className="text-xs font-normal text-base-content/45">
              {station.printerName} — {station.printerHost}
            </span>
          </button>
        ))}
      </div>
      {stations.length === 0 ? (
        <p className="text-sm font-bold text-error">
          لا توجد محطات نشطة — أضفها من لوحة الإدارة ← الطابعات
        </p>
      ) : null}
    </div>
  );
}
