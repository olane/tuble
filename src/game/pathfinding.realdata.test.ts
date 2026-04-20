import { describe, it, expect } from "vitest";
import { findRoute } from "./pathfinding";
import type { RouteHint } from "./types";

/**
 * Integration tests that run against the real tube-graph.json data.
 * These verify that branch-aware routing produces sensible results for
 * known London Underground topologies.
 */

/** Return the first (best) route from findRoute. */
function bestRoute(from: string, to: string): RouteHint {
  const routes = findRoute(from, to);
  expect(routes.length).toBeGreaterThan(0);
  return routes[0];
}

/** True if every segment in the route uses one of the given lines. */
function allSegmentsOnLines(route: RouteHint, lines: string[]): boolean {
  return route.segments.every((s) =>
    s.lines.some((l) => lines.includes(l))
  );
}

describe("branch changes on real data", () => {
  describe("same-line branch changes (expect ≥2 segments on one line)", () => {
    it("Northern: Edgware → High Barnet changes branch at Finchley Central", () => {
      const route = bestRoute("edgware", "high-barnet");
      // Should be all-Northern with a branch change
      expect(allSegmentsOnLines(route, ["northern"])).toBe(true);
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
      // The Edgware and High Barnet branches diverge at Finchley Central
      expect(route.segments[0].endStationId).toBe("finchley-central");
    });

    it("Metropolitan: Chesham → Uxbridge changes branch at Moor Park or Chalfont", () => {
      const route = bestRoute("chesham", "uxbridge");
      expect(allSegmentsOnLines(route, ["metropolitan"])).toBe(true);
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
    });

    it("District: Richmond → Wimbledon requires a branch transition", () => {
      const route = bestRoute("richmond", "wimbledon");
      // May route via Piccadilly for the trunk section, but should show
      // at least 2 segments (the Richmond spur is branch-exclusive).
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
      // First segment should start on the Richmond branch
      expect(route.segments[0].lines).toContain("district");
    });
  });

  describe("trunk traversal (no unnecessary branch changes)", () => {
    it("Northern: Morden → High Barnet has one branch change at Finchley Central", () => {
      const route = bestRoute("morden", "high-barnet");
      expect(allSegmentsOnLines(route, ["northern"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("finchley-central");
    });

    it("Northern: Mill Hill East → Morden is a single segment (same branch through trunk)", () => {
      const route = bestRoute("mill-hill-east", "morden");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("northern");
    });

    it("Piccadilly: Heathrow T4 → Uxbridge via shared trunk is one segment", () => {
      const route = bestRoute("heathrow-terminal-4", "uxbridge");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("piccadilly");
    });

    it("Piccadilly: Heathrow T5 → Uxbridge via shared trunk is one segment", () => {
      const route = bestRoute("heathrow-terminal-5", "uxbridge");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("piccadilly");
    });
  });

  describe("Elizabeth line routing", () => {
    it("Paddington → Stratford is a single Elizabeth segment", () => {
      const route = bestRoute("paddington", "stratford");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("elizabeth");
    });

    it("Paddington → Abbey Wood is a single Elizabeth segment", () => {
      // The Whitechapel junction is trunk (shared by Reading–Stratford and
      // Abbey Wood–Whitechapel services), so no branch change is needed.
      const route = bestRoute("paddington", "abbey-wood");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("elizabeth");
    });
  });

  describe("no unnecessary branch changes", () => {
    it("Bakerloo end-to-end is a single segment", () => {
      const route = bestRoute("elephant-and-castle", "harrow-and-wealdstone");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("bakerloo");
    });

    it("Victoria end-to-end is a single segment", () => {
      const route = bestRoute("brixton", "walthamstow-central");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("victoria");
    });

    it("Metropolitan Aldgate → Amersham is a single segment", () => {
      const route = bestRoute("aldgate", "amersham");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("metropolitan");
    });
  });
});
