import { describe, it, expect } from "vitest";
import { findRoute, getAllStationIds } from "./pathfinding";

// Exhaustive all-pairs test. Slow (~90s with 338 stations, ~114k pairs), so
// it lives in its own file and runs via `npm run test:all-pairs` instead of
// the default test suite. The default suite includes a random-sampled
// version in pathfinding.test.ts.
describe("findRoute (exhaustive)", () => {
  it("can find a route between every pair of stations", () => {
    const ids = getAllStationIds();
    for (const from of ids) {
      for (const to of ids) {
        if (from === to) continue;
        const result = findRoute(from, to);
        expect(result.length, `${from} -> ${to}`).toBeGreaterThan(0);
        expect(result[0].totalStops, `${from} -> ${to}`).toBeGreaterThan(0);
      }
    }
  }, 180_000);
});
