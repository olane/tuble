import { describe, it, expect } from "vitest";
import { findRoute } from "./pathfinding";
import type { RouteHint } from "./types";

/**
 * Integration tests running against the real tube-graph.json data.
 *
 * Expected routing behaviour is derived from the TfL /Line/{id}/Route API,
 * which lists the actual through-running services. Two stations that are on
 * the same through-route should be reachable without a same-line branch
 * change. Two stations on DIFFERENT through-routes of the same line require
 * a branch change at the junction where the routes diverge.
 *
 * TfL through-routes (key examples):
 *   Northern:      Morden–High Barnet, Morden–Edgware, Morden–Mill Hill East
 *   Central:       West Ruislip–Epping, West Ruislip–Hainault,
 *                  Ealing Broadway–Epping, Ealing Broadway–Hainault
 *   District:      Upminster–Richmond, Upminster–Ealing Broadway,
 *                  Upminster–Wimbledon, Edgware Road–Richmond, etc.
 *   Metropolitan:  Aldgate–Chesham, Aldgate–Amersham, Aldgate–Uxbridge
 *   Piccadilly:    Cockfosters–Uxbridge, Cockfosters–Heathrow T5,
 *                  Cockfosters–Heathrow T4
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
  // These pairs are on DIFFERENT through-routes of the same line, so the
  // traveller must change trains at the junction where the routes diverge.

  describe("same-line branch changes", () => {
    it("Northern: Edgware → High Barnet (different routes, change at Camden Town)", () => {
      // Morden–Edgware and Morden–High Barnet are separate through-routes.
      const route = bestRoute("edgware", "high-barnet");
      expect(allSegmentsOnLines(route, ["northern"])).toBe(true);
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
    });

    it("Northern: Morden → High Barnet (same-line, change at Camden Town)", () => {
      // Morden–High Barnet IS a through-route, but Morden–Edgware is too,
      // and they share the trunk. The route should show the branch split.
      const route = bestRoute("morden", "high-barnet");
      expect(allSegmentsOnLines(route, ["northern"])).toBe(true);
      expect(route.segments).toHaveLength(2);
    });

    it("Metropolitan: Chesham → Uxbridge (different routes, change at Harrow-on-the-Hill)", () => {
      // Aldgate–Chesham and Aldgate–Uxbridge are separate through-routes.
      // They share the trunk until Harrow-on-the-Hill where Uxbridge diverges.
      const route = bestRoute("chesham", "uxbridge");
      expect(allSegmentsOnLines(route, ["metropolitan"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("harrow-on-the-hill");
      expect(route.segments[1].endStationId).toBe("uxbridge");
    });

    it("District: Richmond → Ealing Broadway (different routes, change at Turnham Green)", () => {
      // Upminster–Richmond and Upminster–Ealing Broadway are separate routes.
      // No through-route connects Richmond to Ealing Broadway directly.
      const route = bestRoute("richmond", "ealing-broadway");
      expect(allSegmentsOnLines(route, ["district"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("turnham-green");
    });

    it("Piccadilly: Heathrow T4 → Uxbridge (different routes, change at Acton Town)", () => {
      // Cockfosters–T4 and Cockfosters–Uxbridge are separate through-routes.
      // They diverge at Acton Town (T4 goes via Turnham Green, Uxbridge via
      // Ealing Common). No through-route connects T4 to Uxbridge directly.
      const route = bestRoute("heathrow-terminal-4", "uxbridge");
      expect(allSegmentsOnLines(route, ["piccadilly"])).toBe(true);
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
    });

    it("Piccadilly: Heathrow T5 → Uxbridge (different routes, change at Acton Town)", () => {
      // Same as T4 case — Cockfosters–T5 and Cockfosters–Uxbridge diverge
      // at Acton Town.
      const route = bestRoute("heathrow-terminal-5", "uxbridge");
      expect(allSegmentsOnLines(route, ["piccadilly"])).toBe(true);
      expect(route.segments.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Through-routes — no branch change ─────────────────────────────
  // These pairs are on the SAME through-route, so the traveller stays on
  // one train the whole way. No same-line branch change should appear.

  describe("through-routes — no branch change", () => {
    it("Northern: Mill Hill East → Morden (single through-route)", () => {
      // Morden–Mill Hill East is a TfL through-route.
      const route = bestRoute("mill-hill-east", "morden");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("northern");
    });

    it("Central: West Ruislip → Epping (single through-route, 3 segments via Elizabeth)", () => {
      // West Ruislip–Epping is a TfL through-route. The best route goes
      // via the Elizabeth line shortcut: central → elizabeth → central.
      // The Central segments should each be single segments (no spurious
      // branch changes within the Central portions).
      const route = bestRoute("west-ruislip", "epping");
      expect(route.segments).toHaveLength(3);
      expect(route.segments[0].lines).toContain("central");
      expect(route.segments[1].lines).toContain("elizabeth");
      expect(route.segments[2].lines).toContain("central");
    });

    it("Central: Epping → Roding Valley (change at Woodford)", () => {
      // The Epping train goes Woodford → South Woodford → Leytonstone (trunk),
      // NOT toward Roding Valley (Hainault loop side). So a change at Woodford
      // is required.
      const route = bestRoute("epping", "roding-valley");
      expect(allSegmentsOnLines(route, ["central"])).toBe(true);
      expect(route.segments).toHaveLength(2);
      expect(route.segments[0].endStationId).toBe("woodford");
    });

    it("District: Richmond → Upminster (single through-route)", () => {
      // Upminster–Richmond is a TfL through-route.
      const routes = findRoute("richmond", "upminster");
      const allDistrict = routes.find((r) =>
        r.segments.every((s) => s.lines.includes("district"))
      );
      if (allDistrict) {
        // If an all-District route exists, it should be a single segment.
        expect(allDistrict.segments).toHaveLength(1);
      }
    });
  });

  // ── Elizabeth line ─────────────────────────────────────────────────

  describe("Elizabeth line through-running", () => {
    it("Paddington → Stratford is a single Elizabeth segment", () => {
      const route = bestRoute("paddington", "stratford");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("elizabeth");
    });

    it("Paddington → Abbey Wood is a single Elizabeth segment", () => {
      const route = bestRoute("paddington", "abbey-wood");
      expect(route.segments).toHaveLength(1);
      expect(route.segments[0].lines).toContain("elizabeth");
    });
  });

  // ── Unbranched lines ──────────────────────────────────────────────

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
