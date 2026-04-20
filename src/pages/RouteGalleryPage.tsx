import { useMemo } from "react";
import RouteMap from "../components/RouteMap";
import { findRoute, getStationName, graph } from "../game/pathfinding";
import type { RouteHint } from "../game/types";
import { TEST_ROUTES, type TestRoute } from "./testRoutes";

const LINE_CHANGE_PENALTY = 2.5;
const BRANCH_CHANGE_PENALTY = 2.0;

interface ResolvedRoute {
  route: TestRoute;
  hint: RouteHint | null;
  error: string | null;
}

function computeCost(hint: RouteHint): number {
  let cost = hint.totalStops;
  for (let i = 1; i < hint.segments.length; i++) {
    const prevLines = hint.segments[i - 1].lines;
    const currLines = hint.segments[i].lines;
    const sameLine = prevLines.some((l) => currLines.includes(l));
    cost += sameLine ? BRANCH_CHANGE_PENALTY : LINE_CHANGE_PENALTY;
  }
  return cost;
}

function resolve(route: TestRoute): ResolvedRoute {
  if (!graph.stations[route.from]) {
    return { route, hint: null, error: `Unknown station: ${route.from}` };
  }
  if (!graph.stations[route.to]) {
    return { route, hint: null, error: `Unknown station: ${route.to}` };
  }
  try {
    const hints = findRoute(route.from, route.to);
    return { route, hint: hints[0] ?? null, error: null };
  } catch (e) {
    return { route, hint: null, error: (e as Error).message };
  }
}

export default function RouteGalleryPage() {
  const resolved = useMemo(() => TEST_ROUTES.map(resolve), []);

  return (
    <div className="app app-gallery">
      <header className="app-header">
        <h1>Route Gallery</h1>
        <p className="guess-counter">
          {resolved.length} test routes for the rendering engine
        </p>
      </header>

      <div className="route-gallery-grid">
        {resolved.map(({ route, hint, error }, i) => {
          const fromName = getStationName(route.from) ?? route.from;
          const toName = getStationName(route.to) ?? route.to;
          const testUrl = `/test?start=${route.from}&end=${route.to}`;
          return (
            <div key={i} className="route-gallery-card">
              <div className="route-gallery-card-header">
                <div className="route-gallery-card-label">{route.label}</div>
                <a href={testUrl} className="route-gallery-card-link">
                  {fromName} → {toName}
                </a>
              </div>
              {error && <div className="route-test-error">{error}</div>}
              {hint && (
                <>
                  <RouteMap
                    guessId={route.from}
                    segments={hint.segments}
                    revealedKeys={new Set()}
                    showLines={true}
                    revealMatchedSegments={false}
                    revealedTargetLines={new Set()}
                  />
                  <div className="route-gallery-card-meta">
                    {hint.totalStops} stops · {hint.segments.length}{" "}
                    {hint.segments.length === 1 ? "segment" : "segments"}{" "}
                    · cost {computeCost(hint)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="route-test-nav">
        <a href="/">Back to game</a>
      </div>
    </div>
  );
}
