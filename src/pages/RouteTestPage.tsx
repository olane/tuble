import { useMemo } from "react";
import RouteMap from "../components/RouteMap";
import { findRoute, getStationName, graph } from "../game/pathfinding";
import type { RouteHint } from "../game/types";

interface RouteTestPageProps {
  params: URLSearchParams;
}

interface RouteResult {
  hints: RouteHint[] | null;
  error: string | null;
}

function computeRoute(from: string, to: string): RouteResult {
  if (!from || !to) {
    return { hints: null, error: "Provide ?start=<id>&end=<id> in the URL." };
  }
  if (!graph.stations[from]) {
    return { hints: null, error: `Unknown start station: ${from}` };
  }
  if (!graph.stations[to]) {
    return { hints: null, error: `Unknown end station: ${to}` };
  }
  try {
    return { hints: findRoute(from, to), error: null };
  } catch (e) {
    return { hints: null, error: (e as Error).message };
  }
}

export default function RouteTestPage({ params }: RouteTestPageProps) {
  const from = params.get("start") ?? "";
  const to = params.get("end") ?? "";

  const result = useMemo(() => computeRoute(from, to), [from, to]);

  const fromName = getStationName(from) ?? from;
  const toName = getStationName(to) ?? to;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Route Test</h1>
        <p className="guess-counter">
          {from && to ? `${fromName} → ${toName}` : "rendering engine preview"}
        </p>
      </header>

      {result.error && (
        <div className="route-test-error">
          <p>{result.error}</p>
          <p className="route-test-hint">
            Try{" "}
            <a href="/test?start=bank&end=canary-wharf">
              /test?start=bank&amp;end=canary-wharf
            </a>
            .
          </p>
        </div>
      )}

      {result.hints?.map((hint, i) => (
        <div key={i} className="route-test-hint-block">
          <div className="route-test-hint-label">
            Route {i + 1} of {result.hints!.length} · {hint.totalStops} stops ·{" "}
            {hint.segments.length}{" "}
            {hint.segments.length === 1 ? "segment" : "segments"}
          </div>
          <RouteMap
            guessId={from}
            segments={hint.segments}
            revealedKeys={new Set()}
            showLines={true}
            revealMatchedSegments={false}
            revealedTargetLines={new Set()}
          />
          <ol className="route-test-segments">
            {hint.segments.map((seg, j) => (
              <li key={j}>
                {seg.lines.join(" / ")} — {seg.stops}{" "}
                {seg.stops === 1 ? "stop" : "stops"} to{" "}
                {getStationName(seg.endStationId) ?? seg.endStationId}
              </li>
            ))}
          </ol>
        </div>
      ))}

      <div className="route-test-nav">
        <a href="/gallery">Gallery</a> · <a href="/">Back to game</a>
      </div>
    </div>
  );
}
