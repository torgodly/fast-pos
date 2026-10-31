import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  getSettingValue: () => null,
  setSettingValue: () => {},
  deleteSettingValue: () => {},
  getBrandDetails: () => ({ name: "", phone: "", address: "" }),
  getReceiptFooterMessage: () => "",
}));
import { DEFAULT_REPORT_TEMPLATES } from "./templates/defaults";

type BuildFn = typeof import("./templates/build").buildKitchenEscPos;
let buildKitchenEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildKitchenEscPos } = await import("./templates/build"));
});

function cutTail(bytes: Uint8Array) {
  const cut = [0x1d, 0x56, 0x00];
  const index = bytes.findLastIndex(
    (byte, position) =>
      byte === cut[0] &&
      bytes[position + 1] === cut[1] &&
      bytes[position + 2] === cut[2],
  );
  if (index < 0) return null;

  let feed = 0;
  for (let position = index - 1; position >= 0; position -= 1) {
    if (bytes[position] !== 0x0a) break;
    feed += 1;
  }
  return { index, feed };
}

describe("kitchen ticket cut clearance", () => {
  it("feeds enough blank lines to clear the last note before cutting", async () => {
    const bytes = await buildKitchenEscPos(
      {
        venueName: "مطعم",
        orderId: 7,
        tableName: "T1",
        waiterName: "Ali",
        createdAt: "12:30",
        kind: "order",
        lines: [{ name: "Pizza", qty: 1, note: "no onion no pepper" }],
      },
      { template: DEFAULT_REPORT_TEMPLATES.kitchen, logo: null },
    );

    const tail = cutTail(bytes);
    expect(tail).not.toBeNull();
    expect(tail!.feed).toBeGreaterThanOrEqual(8);
  });
});
