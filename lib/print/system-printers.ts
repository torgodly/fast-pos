import type { SystemPrinter } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalText(value: unknown) {
  const text = readText(value);
  return text || null;
}

function readOptionalPort(value: unknown) {
  const port = typeof value === "number" ? value : Number(value);
  return Number.isInteger(port) && port > 0 ? port : null;
}

function readFlag(value: unknown) {
  return value === true || value === 1 || value === "true" || value === "True";
}

export function parseSystemPrintersJson(output: string): SystemPrinter[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("قائمة طابعات النظام غير صالحة");
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const seen = new Set<string>();
  const printers: SystemPrinter[] = [];

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;

    const name = readText(record.name);
    if (!name) continue;

    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    printers.push({
      name,
      driver: readText(record.driver),
      portName: readText(record.portName),
      isDefault: readFlag(record.isDefault),
      host: readOptionalText(record.host),
      port: readOptionalPort(record.port),
    });
  }

  return printers.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      a.name.localeCompare(b.name, "ar"),
  );
}
