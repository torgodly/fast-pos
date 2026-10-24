import type { SystemPrinter } from "@/lib/types";

export type SystemPrinterRef = {
  name: string;
  host: string;
  port: number;
};

const PREFIX = "sys:";
const MAX_NAME_LENGTH = 120;

/**
 * Category printer selects submit `sys:<encoded JSON>` for a Windows printer
 * that is not saved yet. The server creates/reuses the printer on save.
 */
export function encodeSystemPrinterRef(printer: SystemPrinter): string | null {
  const host = printer.host?.trim();
  if (!host) return null;
  const port =
    Number.isInteger(printer.port) && (printer.port ?? 0) > 0
      ? printer.port
      : 9100;
  return `${PREFIX}${encodeURIComponent(
    JSON.stringify({ name: printer.name.trim(), host, port }),
  )}`;
}

export function parseSystemPrinterRef(value: string): SystemPrinterRef | null {
  if (!value.startsWith(PREFIX)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value.slice(PREFIX.length)));
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const host = typeof record.host === "string" ? record.host.trim() : "";
  const port = Number(record.port);

  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (!host || /\s/.test(host)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return { name, host, port };
}
