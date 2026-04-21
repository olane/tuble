import { describe, it, expect } from "vitest";
import { formatRidership } from "./utils";

describe("formatRidership", () => {
  it("formats numbers >= 1000 as k", () => {
    expect(formatRidership(1000)).toBe("1k");
    expect(formatRidership(1500)).toBe("2k");
    expect(formatRidership(25000)).toBe("25k");
    expect(formatRidership(999500)).toBe("1000k");
  });

  it("returns plain string for numbers < 1000", () => {
    expect(formatRidership(0)).toBe("0");
    expect(formatRidership(500)).toBe("500");
    expect(formatRidership(999)).toBe("999");
  });

  it("rounds to nearest thousand", () => {
    expect(formatRidership(1499)).toBe("1k");
    expect(formatRidership(1500)).toBe("2k");
    expect(formatRidership(2750)).toBe("3k");
  });
});
