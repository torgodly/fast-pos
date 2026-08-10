import { describe, expect, it } from "vitest";
import {
  menuScopeLabel,
  parseMenuVenueScope,
  scopeToVenueId,
  venueIdToScope,
} from "./scope";

describe("menu venue scope", () => {
  it("parses cafe / restaurant / shared", () => {
    expect(parseMenuVenueScope("cafe")).toBe("cafe");
    expect(parseMenuVenueScope("restaurant")).toBe("restaurant");
    expect(parseMenuVenueScope("shared")).toBe("shared");
    expect(parseMenuVenueScope("other")).toBeNull();
  });

  it("maps scope ↔ venue_id null", () => {
    expect(scopeToVenueId("shared")).toBeNull();
    expect(scopeToVenueId("cafe")).toBe("cafe");
    expect(venueIdToScope(null)).toBe("shared");
    expect(venueIdToScope("restaurant")).toBe("restaurant");
  });

  it("labels scopes in Arabic", () => {
    expect(menuScopeLabel("shared")).toBe("مشترك");
    expect(menuScopeLabel("cafe")).toBe("كافيه فقط");
  });
});
