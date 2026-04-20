import { describe, it, expect } from "vitest";
import { findRoute } from "./pathfinding";
import type { RouteHint } from "./types";

/**
 * Integration tests running against the real tube-graph.json data.
 * These verify that branch-aware routing produces sensible results for
 * known London Underground topologies, and that the branch data pipeline
 * (chaining, propagation, slug derivation) generates correct edge metadata.
 *
 * The tests are grouped to mirror the gallery test routes and cover:
 * - Same-line branch changes at specific junctions
 * - Trunk traversal without unnecessary branch changes
 * - Elizabeth line through-running
 * - Unbranched lines staying as single segments
 * - Hidden branch changes (committed → trunk → different branch)
 */

/** Return the first (best) route from findRoute. */
function bestRoute(from: string, to: string): RouteHint {
  const routes = findRoute(from, to);
  expect(routes.length).toBeGreaterThan(0);
  return routes[0];
}

/** True if every segment in the route uses one of the given lines. */
function allSegmentsOnLines(route: RouteHint, lines: string[]): boolean {
  return route.segments.every((s) => s.lines.some((l) => lines.includes(l)));
}

describe("branch changes on real data", () => {
  // ── Same-line branch changes ──────────────────────────────────────
  // These routes must show ≥2 segments on a single line, proving the
  // router detects that the traveller needs to change trains.

  describe("same-line branch changes", () => {
    it("Northern: Edgware → High Barnet changes at Camden Town", () => {
      const route = bestRoute("edgware", "high-barnet");
      expect(allSegmentsOnLines(route, ["northern"])).toBe(true);
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
      expect(route.segments[0].endStationId).toBe("camden-town");
    });

    it("Northern: Morden → High Barnet changes at Camden Town", () => {
      const route = bestRoute("morden", "high-barnet");
      expect(allSegmentsOnLines(route, ["northern"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("camden-town");
    });

    it("Metropolitan: Chesham → Uxbridge changes at Harrow-on-the-Hill", () => {
      // The Chesham service runs through to Harrow-on-the-Hill (propagation
      // extends the chesham branch slug through the amersham sequence).
      // The Uxbridge branch splits off at Harrow.
      const route = bestRoute("chesham", "uxbridge");
      expect(allSegmentsOnLines(route, ["metropolitan"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("harrow-on-the-hill");
      expect(route.segments[1].endStationId).toBe("uxbridge");
    });

    it("District: Richmond → Ealing Broadway changes at Turnham Green", () => {
      const route = bestRoute("richmond", "ealing-broadway");
      expect(allSegmentsOnLines(route, ["district"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("turnham-green");
      expect(route.segments[1].endStationId).toBe("ealing-broadway");
    });

    it("District: Richmond → Wimbledon shows a branch transition", () => {
      // The best route uses a Piccadilly shortcut through the trunk
      // (Turnham Green → Hammersmith → Barons Court → Earl's Court).
      const route = bestRoute("richmond", "wimbledon");
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
      expect(route.segments[0].lines).toContain("district");
    });
  });

  // ── Trunk traversal (no unnecessary branch changes) ───────────────
  // These routes cross through shared trunk sections where multiple
  // services overlap. The router should stay uncommitted on trunk and
  // not charge a branch-change penalty.

  describe("trunk traversal — no unnecessary branch changes", () => {
    it("Northern: Mill Hill East → Morden is a single segment", () => {
      // Mill Hill East is on the High Barnet branch. The train continues
      // through trunk (shared by both branches) all the way to Morden.
      const route = bestRoute("mill-hill-east", "morden");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("northern");
    });

    it("Piccadilly: Heathrow T4 → Uxbridge via shared trunk is one segment", () => {
      // Both the T4 loop and the Uxbridge branch share the Hounslow trunk.
      // The router stays uncommitted through trunk then commits to the
      // Uxbridge branch without penalty.
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

  // ── Elizabeth line ─────────────────────────────────────────────────
  // The Elizabeth line has multiple TfL fragments that get chained into
  // through-running services by the build pipeline.

  describe("Elizabeth line through-running", () => {
    it("Paddington → Stratford is a single Elizabeth segment", () => {
      // The reading-stratford chain covers this entire route.
      const route = bestRoute("paddington", "stratford");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("elizabeth");
    });

    it("Paddington → Abbey Wood is a single Elizabeth segment", () => {
      // Whitechapel is trunk (shared by reading-stratford and
      // abbey-wood-whitechapel), so no branch change needed.
      const route = bestRoute("paddington", "abbey-wood");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("elizabeth");
    });
  });

  // ── Unbranched lines stay single segment ──────────────────────────

  describe("unbranched lines — single segment end-to-end", () => {
    it("Bakerloo end-to-end", () => {
      const route = bestRoute("elephant-and-castle", "harrow-and-wealdstone");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("bakerloo");
    });

    it("Victoria end-to-end", () => {
      const route = bestRoute("brixton", "walthamstow-central");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("victoria");
    });

    it("Metropolitan Aldgate → Amersham", () => {
      const route = bestRoute("aldgate", "amersham");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("metropolitan");
    });
  });
});
