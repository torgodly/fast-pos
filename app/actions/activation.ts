"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/actions/auth";
import {
  activateLicense as saveLicense,
  deactivateLicense as removeLicense,
} from "@/lib/activation/service";

export async function activateLicense(formData: FormData) {
  await requireAdmin();
  const result = saveLicense(String(formData.get("license") ?? ""));
  if (!result.ok) {
    redirect(`/admin/activation?error=${encodeURIComponent(result.reason)}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/activation");
  redirect("/admin/activation?activated=1");
}

export async function deactivateLicense() {
  await requireAdmin();
  removeLicense();
  revalidatePath("/");
  revalidatePath("/admin/activation");
  redirect("/admin/activation?deactivated=1");
}
