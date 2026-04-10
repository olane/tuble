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
    expect(result).toHaveLength(1);
    expect(result[0].totalStops).toBe(1);
    expect(result[0].segments).toMatchObject([{ lines: ["central"], stops: 1, endStationId: "st-pauls" }]);
  });

  it("finds a route with multiple options and merges parallel lines", () => {
    // Victoria to Canary Wharf: district/circle share the same segment shape
    const result = findRoute("victoria", "canary-wharf");
    expect(result).toMatchObject([
      {
        segments: [
          { lines: ["circle", "district"], stops: 2, endStationId: "westminster" },
          { lines: ["jubilee"], stops: 6, endStationId: "canary-wharf" },
        ],
        totalStops: 8,
      },
      {
        segments: [
          { lines: ["victoria"], stops: 1, endStationId: "green-park" },
          { lines: ["jubilee"], stops: 7, endStationId: "canary-wharf" },
        ],
        totalStops: 8,
      },
    ]);
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
  }, 30_000);
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
