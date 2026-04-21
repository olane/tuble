import { describe, it, expect } from "vitest";
import { getRevealedSegments } from "../../src/components/RouteMap";
import type { RouteSegment } from "../../src/game/types";

function seg(
  lines: string[],
  stops: number,
  endStationId: string
): RouteSegment {
  return { lines, stops, endStationId, path: [endStationId] };
}

describe("getRevealedSegments", () => {
  it("reveals a segment that appears in two different guesses", () => {
    const guesses = [
      {
        stationId: "a",
        hint: { segments: [seg(["central"], 3, "b"), seg(["northern"], 2, "target")] },
      },
      {
        stationId: "c",
        hint: { segments: [seg(["jubilee"], 1, "b"), seg(["northern"], 2, "target")] },
      },
    ];

    const revealed = getRevealedSegments(guesses);
    // northern:2:target appears in both guesses
    expect(revealed.has("northern:2:target")).toBe(true);
  });

  it("does not reveal a segment that only appears in one guess", () => {
    const guesses = [
      {
        stationId: "a",
        hint: { segments: [seg(["central"], 3, "b"), seg(["northern"], 2, "target")] },
      },
      {
        stationId: "c",
        hint: { segments: [seg(["jubilee"], 1, "b"), seg(["victoria"], 4, "target")] },
      },
    ];

    const revealed = getRevealedSegments(guesses);
    expect(revealed.size).toBe(0);
  });

  it("reveals segments that share lines/stops/end even when fromId differs", () => {
    // Regression: the map previously used a key that included fromId,
    // so two segments approaching the same stretch from different origins
    // were not detected as shared.
    const guesses = [
      {
        stationId: "a",
        hint: { segments: [seg(["central"], 3, "d")] },
      },
      {
        stationId: "b",
        hint: { segments: [seg(["central"], 3, "d")] },
      },
    ];

    const revealed = getRevealedSegments(guesses);
    expect(revealed.has("central:3:d")).toBe(true);
  });

  it("handles multi-line segments with sorted key", () => {
    const guesses = [
      {
        stationId: "a",
        hint: { segments: [seg(["northern", "central"], 2, "b")] },
      },
      {
        stationId: "c",
        hint: { segments: [seg(["central", "northern"], 2, "b")] },
      },
    ];

    const revealed = getRevealedSegments(guesses);
    expect(revealed.has("central,northern:2:b")).toBe(true);
  });

  it("returns empty set for a single guess", () => {
    const guesses = [
      {
        stationId: "a",
        hint: { segments: [seg(["central"], 3, "b"), seg(["northern"], 2, "target")] },
      },
    ];

    const revealed = getRevealedSegments(guesses);
    expect(revealed.size).toBe(0);
  });
});
