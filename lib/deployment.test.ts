import { describe, expect, it } from "vitest";
import {
  parseDeploymentFile,
  parseDeploymentMode,
  staffLandingPath,
} from "./deployment-mode";
import { activeVenues } from "./venues";

describe("deployment mode parse", () => {
  it("accepts only full | counter", () => {
    expect(parseDeploymentMode("full")).toBe("full");
    expect(parseDeploymentMode("counter")).toBe("counter");
    expect(parseDeploymentMode("other")).toBeNull();
    expect(parseDeploymentMode(null)).toBeNull();
  });

  it("parses installer deployment.json", () => {
    expect(parseDeploymentFile('{"mode":"counter"}')).toBe("counter");
    expect(parseDeploymentFile('{"mode":"full"}')).toBe("full");
    expect(parseDeploymentFile("{")).toBeNull();
    expect(parseDeploymentFile("")).toBeNull();
    expect(parseDeploymentFile('{"mode":"kiosk"}')).toBeNull();
  });
});

describe("venue filter", () => {
  it("keeps both venues in full mode", () => {
    expect(activeVenues("full").map((v) => v.id)).toEqual([
      "restaurant",
      "cafe",
    ]);
  });

  it("keeps restaurant only in counter mode", () => {
    expect(activeVenues("counter").map((v) => v.id)).toEqual(["restaurant"]);
  });
});

describe("staff landing path", () => {
  it("sends cashiers to the floor list in full mode", () => {
    expect(staffLandingPath("cashier", "cafe", "full")).toBe("/cashier/cafe");
    expect(staffLandingPath("waiter", "restaurant", "full")).toBe(
      "/waiter/restaurant",
    );
  });

  it("sends staff to cashier quick-sale in counter mode", () => {
    expect(staffLandingPath("cashier", "restaurant", "counter")).toBe(
      "/cashier/restaurant/quick",
    );
  });
});
