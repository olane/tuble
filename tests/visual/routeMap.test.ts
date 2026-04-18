import { describe, it, expect } from "vitest";
import { createElement } from "react";
import RouteMap from "../../src/components/RouteMap";
import { findRoute } from "../../src/game/pathfinding";
import { TEST_ROUTES } from "../../src/pages/testRoutes";
import { rasterize, compareToBaseline } from "./utils";

describe("RouteMap visual regression", () => {
  for (const route of TEST_ROUTES) {
    it(`${route.label} (${route.from} → ${route.to})`, () => {
      const hint = findRoute(route.from, route.to)[0];
      const element = createElement(RouteMap, {
        guessId: route.from,
        segments: hint.segments,
        revealedKeys: new Set<string>(),
        showLines: true,
        revealMatchedSegments: false,
        revealedTargetLines: new Set<string>(),
      });

      const rendered = rasterize(element);
      const name = `${route.from}__${route.to}`;
      const result = compareToBaseline(name, rendered);

      if (!result.matched) {
        throw new Error(result.message ?? "Visual mismatch");
      }
    });
  }
});
