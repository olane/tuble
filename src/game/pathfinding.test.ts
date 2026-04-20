import { describe, it, expect } from "vitest";
import { findRoute, getStationName, getAllStationIds } from "./pathfinding";

describe("findRoute", () => {
  it("returns empty segments for same station", () => {
    const ids = getAllStationIds();
    for (const id of ids) {
        const result = findRoute(id, id);
        expect(result, `${id} -> ${id}`).toEqual([{ segments: [], totalStops: 0 }]);
      }
    }
  );

  it("throws for non-existent station", () => {
    expect(() => findRoute("fake-station", "bank")).toThrow("Unknown station: fake-station");
    expect(() => findRoute("bank", "fake-station")).toThrow("Unknown station: fake-station");
  });

  it("finds a direct single-line route between adjacent stations", () => {
    // Bank -> St. Paul's are adjacent on Central line
    const result = findRoute("bank", "st-pauls");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].totalStops).toBe(1);
    expect(result[0].segments).toMatchObject([{ lines: ["central"], stops: 1, endStationId: "st-pauls" }]);
  });

  it("finds a route with multiple options including parallel lines", () => {
    // Victoria to Canary Wharf: district and circle follow the same stops to
    // Westminster, then Jubilee to Canary Wharf.  With branch-aware routing
    // they may appear as separate routes (different branch slugs) rather than
    // being merged into one segment with lines: ["circle","district"].
    const result = findRoute("victoria", "canary-wharf");

    // There should be a Victoria→Jubilee route
    const viaVictoria = result.find(
      (r) =>
        r.totalStops === 8 &&
        r.segments.length === 2 &&
        r.segments[0].lines.includes("victoria") &&
        r.segments[1].lines.includes("jubilee")
    );
    expect(viaVictoria).toBeDefined();

    // And at least one District or Circle → Jubilee route
    const viaDistrictOrCircle = result.find(
      (r) =>
        r.totalStops === 8 &&
        r.segments.some(
          (s) =>
            s.endStationId === "westminster" &&
            (s.lines.includes("district") || s.lines.includes("circle"))
        ) &&
        r.segments.some(
          (s) => s.endStationId === "canary-wharf" && s.lines.includes("jubilee")
        )
    );
    expect(viaDistrictOrCircle).toBeDefined();
  });

  it("finds a single line route from Oxford Circus to Bank", () => {
    // this route ends up with multiple hops if you don't penalise changes
    const result = findRoute("oxford-circus", "bank");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          segments: expect.arrayContaining([
            expect.objectContaining({ lines: ["central"], stops: 5, endStationId: "bank" }),
          ]),
          totalStops: 5,
        }),
      ])
    );
  });

  it("every segment has valid lines", () => {
    const result = findRoute("paddington", "stratford");
    for (const route of result) {
      for (const seg of route.segments) {
        expect(seg.lines.length).toBeGreaterThan(0);
        expect(seg.stops).toBeGreaterThan(0);
        expect(seg.endStationId).toBeTruthy();
      }
    }
  });

  // Sampled smoke test — the full all-pairs sweep lives in
  // pathfinding.all-pairs.test.ts and runs via `npm run test:all-pairs`.
  it("can find a route for a random sample of station pairs", () => {
    const ids = getAllStationIds();
    const sampleCount = 500;
    for (let i = 0; i < sampleCount; i++) {
      const from = ids[Math.floor(Math.random() * ids.length)];
      let to = ids[Math.floor(Math.random() * ids.length)];
      while (to === from) to = ids[Math.floor(Math.random() * ids.length)];
      const result = findRoute(from, to);
      expect(result.length, `${from} -> ${to}`).toBeGreaterThan(0);
      expect(result[0].totalStops, `${from} -> ${to}`).toBeGreaterThan(0);
    }
  });
});

describe("getStationName", () => {
  it("returns station name for valid id", () => {
    expect(getStationName("bank")).toBe("Bank");
  });

  it("returns undefined for invalid id", () => {
    expect(getStationName("nonexistent")).toBeUndefined();
  });
});

describe("getAllStationIds", () => {
  it("returns all 299 stations", () => {
    expect(getAllStationIds().length).toBe(299);
  });
});
