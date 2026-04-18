import { describe, it, expect } from "vitest";
import { computeRouteGeometry } from "../../src/components/RouteMap";
import { findRoute } from "../../src/game/pathfinding";
import { TEST_ROUTES } from "../../src/pages/testRoutes";

// Must stay in sync with the constants in RouteMap.tsx. If rendering is
// re-tuned, update these and regenerate visual baselines.
const MAX_WIDTH = 400;
const PADDING = 30;
const NODE_RADIUS = 9;
const TARGET_RADIUS = 12;

interface Point { x: number; y: number; }

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("RouteMap geometry invariants", () => {
  for (const route of TEST_ROUTES) {
    describe(`${route.label} (${route.from} → ${route.to})`, () => {
      const hint = findRoute(route.from, route.to)[0];
      const geo = computeRouteGeometry(route.from, hint.segments);

      it("produces one point-list per segment", () => {
        expect(geo.segmentPoints.length).toBe(hint.segments.length);
      });

      it("produces finite, non-negative coordinates", () => {
        for (const pts of geo.segmentPoints) {
          for (const p of pts) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
          }
        }
      });

      it("respects MAX_WIDTH", () => {
        expect(geo.width).toBeLessThanOrEqual(MAX_WIDTH + 0.5);
      });

      it("interchange and target nodes don't overlap", () => {
        const nodes: Point[] = [];
        for (let i = 0; i < geo.segmentPoints.length - 1; i++) {
          const pts = geo.segmentPoints[i];
          nodes.push(pts[pts.length - 1]);
        }
        const last = geo.segmentPoints[geo.segmentPoints.length - 1];
        nodes.push(last[last.length - 1]);

        const minGap = NODE_RADIUS + TARGET_RADIUS;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            expect(dist(nodes[i], nodes[j])).toBeGreaterThanOrEqual(minGap);
          }
        }
      });

      it("leaves room for padding", () => {
        for (const pts of geo.segmentPoints) {
          for (const p of pts) {
            expect(p.x).toBeGreaterThanOrEqual(PADDING - 0.5);
            expect(p.y).toBeGreaterThanOrEqual(PADDING - 0.5);
          }
        }
      });

      it("has contiguous segments (segment N ends where segment N+1 starts)", () => {
        for (let i = 1; i < geo.segmentPoints.length; i++) {
          const prevEnd = geo.segmentPoints[i - 1].at(-1)!;
          const currStart = geo.segmentPoints[i][0];
          expect(dist(prevEnd, currStart)).toBeLessThan(0.01);
        }
      });
    });
  }
});
