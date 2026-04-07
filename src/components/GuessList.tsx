import { useMemo } from "react";
import type { GuessResult } from "../game/types";
import linesData from "../data/lines.json";

const lines = linesData as Record<string, { name: string; colour: string }>;

function formatRidership(n: number): string {
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

const MARKER_COLOURS = [
  "#3498db", "#e74c3c", "#2ecc71", "#9b59b6",
  "#f39c12", "#1abc9c", "#e67e22", "#e84393",
];

interface GuessListProps {
  guesses: GuessResult[];
  getStationName: (id: string) => string | undefined;
  getStationZone: (id: string) => string | undefined;
  revealStations: boolean;
  showLines: boolean;
  showZones: boolean;
}

/**
 * Build a map from interchange station ID to a marker colour,
 * only for stations that appear as interchanges in 2+ different guesses.
 */
function buildSharedMarkers(guesses: GuessResult[]): Map<string, string> {
  // Count how many distinct guesses each interchange station appears in
  const guessCountByStation = new Map<string, Set<number>>();

  for (let gi = 0; gi < guesses.length; gi++) {
    const guess = guesses[gi];
    if (guess.correct) continue;
    const segs = guess.hint.segments;
    // Only interchange stations (not the final destination)
    for (let si = 0; si < segs.length - 1; si++) {
      const id = segs[si].endStationId;
      let set = guessCountByStation.get(id);
      if (!set) {
        set = new Set();
        guessCountByStation.set(id, set);
      }
      set.add(gi);
    }
  }

  const markers = new Map<string, string>();
  let colourIdx = 0;
  for (const [stationId, guessIndices] of guessCountByStation) {
    if (guessIndices.size >= 2) {
      markers.set(stationId, MARKER_COLOURS[colourIdx % MARKER_COLOURS.length]);
      colourIdx++;
    }
  }
  return markers;
}

export default function GuessList({ guesses, getStationName, getStationZone, revealStations, showLines, showZones }: GuessListProps) {
  if (guesses.length === 0) return null;

  const sharedMarkers = useMemo(() => buildSharedMarkers(guesses), [guesses]);

  return (
    <div className="guess-list">
      {guesses.map((guess, i) => (
        <div key={i} className={`guess-row ${guess.correct ? "correct" : ""}`}>
          <div className="guess-header">
            <div className="guess-station">{getStationName(guess.stationId)}</div>
            {guess.codeHint?.letters.length > 0 && (
              <div className="code-tiles">
                {guess.codeHint.letters.map((l, k) => (
                  <span key={k} className={`code-tile ${l.status}`}>
                    {l.char}
                  </span>
                ))}
              </div>
            )}
          </div>
          {guess.correct ? (
            <div className="guess-correct-label">Correct!</div>
          ) : (
            <div className="guess-hint">
              <div className="route-segments">
                {guess.hint.segments.map((seg, j) => {
                  const isInterchange = j < guess.hint.segments.length - 1;
                  const marker = isInterchange ? sharedMarkers.get(seg.endStationId) : undefined;

                  return (
                    <div key={j} className="segment">
                      <span className="segment-chevron">&#x25B8;</span>
                      {showLines && (
                        <div className="segment-lines">
                          {seg.lines.map((lineId, k) => (
                            <>
                              {k > 0 && <span key={`sep-${k}`} className="line-separator">/</span>}
                              <span
                                key={lineId}
                                className="line-badge"
                                style={{ backgroundColor: lines[lineId]?.colour ?? "#666" }}
                                title={lines[lineId]?.name ?? lineId}
                              >
                                {lines[lineId]?.name ?? lineId}
                              </span>
                            </>
                          ))}
                        </div>
                      )}
                      <div className="segment-stops">
                        {seg.stops} {seg.stops === 1 ? "stop" : "stops"}
                      </div>
                      {revealStations ? (
                        <div className="segment-arrow">
                          {isInterchange
                            ? "change at " + (getStationName(seg.endStationId) ?? seg.endStationId)
                            : getStationName(seg.endStationId) ?? seg.endStationId}
                        </div>
                      ) : (
                        <>
                          {isInterchange && showZones && (
                            <span className="segment-zone" title="Zone of interchange station">
                              Zone {getStationZone(seg.endStationId) ?? "?"}
                            </span>
                          )}
                          {marker && (
                            <div className="segment-marker">
                              <span
                                className="station-marker"
                                style={{ backgroundColor: marker }}
                                title="Shared interchange"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="guess-footer">
                <div className="guess-total">
                  {guess.hint.totalStops} {guess.hint.totalStops === 1 ? "stop" : "stops"} away
                </div>
                {guess.ridership != null && (
                  <div
                    className="guess-ridership"
                    title={
                      guess.ridershipComparison === "higher"
                        ? "Target station is quieter"
                        : guess.ridershipComparison === "lower"
                          ? "Target station is busier"
                          : "Same ridership as target"
                    }
                  >
                    {formatRidership(guess.ridership)}/day {guess.ridershipComparison === "higher" ? "\u25BC" : guess.ridershipComparison === "lower" ? "\u25B2" : "="}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
