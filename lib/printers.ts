import { inArray } from "drizzle-orm";
import { printers } from "@/lib/db/schema";
import type { PrinterRole } from "@/lib/types";

export const KITCHEN_PRINTER_ROLES = ["kitchen", "both"] as const;
export const CHECKOUT_PRINTER_ROLES = ["checkout", "both"] as const;

export function supportsKitchen(role: string) {
  return role === "kitchen" || role === "both";
}

export function supportsCheckout(role: string) {
  return role === "checkout" || role === "both";
}

export function printerRoleLabel(role: string): string {
  switch (role) {
    case "kitchen":
      return "مطبخ";
    case "checkout":
      return "فاتورة كاشير";
    case "both":
      return "مطبخ + فاتورة";
    default:
      return role;
  }
}

export function isPrinterRole(value: string): value is PrinterRole {
  return value === "kitchen" || value === "checkout" || value === "both";
}

export const kitchenPrinterRolesFilter = inArray(
  printers.role,
  [...KITCHEN_PRINTER_ROLES],
);

export const checkoutPrinterRolesFilter = inArray(
  printers.role,
  [...CHECKOUT_PRINTER_ROLES],
);
