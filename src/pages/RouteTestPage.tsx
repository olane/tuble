import { useMemo } from "react";
import { findRoute, getStationName, graph } from "../game/pathfinding";
import type { GuessResult, RouteHint } from "../game/types";
import GuessList from "../components/GuessList";

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

/** Build a fake GuessResult so we can render via GuessList. */
function fakeGuess(stationId: string, hint: RouteHint): GuessResult {
  return {
    stationId,
    correct: false,
    hint,
    codeHint: { letters: [] },
    ridership: 0,
    ridershipComparison: "equal",
    zone: "",
    zoneComparison: "equal",
  };
}

export default function RouteTestPage({ params }: RouteTestPageProps) {
  const from = params.get("start") ?? "";
  const to = params.get("end") ?? "";

  const result = useMemo(() => computeRoute(from, to), [from, to]);

  const fromName = getStationName(from) ?? from;
  const toName = getStationName(to) ?? to;

  // Build fake guesses for each route hint so GuessList can render them
  const guesses = useMemo(
    () => result.hints?.map((hint) => fakeGuess(from, hint)) ?? [],
    [result.hints, from]
  );

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

      {guesses.length > 0 && (
        <>
          <div className="route-test-hint-label">
            {result.hints!.length} route{result.hints!.length === 1 ? "" : "s"} ·{" "}
            {result.hints![0].totalStops} stops ·{" "}
            {result.hints![0].segments.length}{" "}
            {result.hints![0].segments.length === 1 ? "segment" : "segments"}
          </div>
          <GuessList
            guesses={guesses}
            getStationName={getStationName}
            revealStations={true}
            showLines={true}
            revealMatchedSegments={false}
            revealedTargetLines={new Set()}
          />
        </>
      )}

      <div className="route-test-nav">
        <a href="/gallery">Gallery</a> · <a href="/">Back to game</a>
      </div>
    </div>
  );
}
