"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Power } from "lucide-react";

export function ToggleActiveButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await onToggle();
          router.refresh();
        })
      }
      className="btn btn-square btn-ghost btn-sm"
      title={active ? "تعطيل" : "تفعيل"}
    >
      <Power className="size-4" />
    </button>
  );
}
