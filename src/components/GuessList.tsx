import { useMemo } from "react";
import type { GuessResult } from "../game/types";
import linesData from "../data/lines.json";
import RouteMap, { getRevealedSegments, contrastingTextColor } from "./RouteMap";

const lines = linesData as Record<string, { name: string; colour: string }>;

function comparisonArrow(c: "higher" | "lower" | "equal"): string {
  if (c === "higher") return "\u25BC";
  if (c === "lower") return "\u25B2";
  return "=";
}

function formatRidership(n: number): string {
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

interface GuessListProps {
  guesses: GuessResult[];
  getStationName: (id: string) => string | undefined;
  revealStations: boolean;
  showLines: boolean;
  revealMatchedSegments: boolean;
  revealedTargetLines: Set<string>;
}

/**
 * A segment key uniquely identifies a segment by its stop count,
 * end station, and sorted line set.
 */
function segmentKey(seg: { lines: string[]; stops: number; endStationId: string }): string {
  return `${[...seg.lines].sort().join(",")}:${seg.stops}:${seg.endStationId}`;
}

/**
 * Find segments that appear in 2+ different guesses.
 * Returns a set of segment keys that are shared.
 */
function buildSharedSegments(guesses: GuessResult[]): Set<string> {
  const segGuessCount = new Map<string, Set<number>>();

  for (let gi = 0; gi < guesses.length; gi++) {
    const guess = guesses[gi];
    if (guess.correct) continue;
    for (const seg of guess.hint.segments) {
      const key = segmentKey(seg);
      let set = segGuessCount.get(key);
      if (!set) {
        set = new Set();
        segGuessCount.set(key, set);
      }
      set.add(gi);
    }
  }

  const shared = new Set<string>();
  for (const [key, guessIndices] of segGuessCount) {
    if (guessIndices.size >= 2) {
      shared.add(key);
    }
  }
  return shared;
}

export default function GuessList({ guesses, getStationName, revealStations, showLines, revealMatchedSegments, revealedTargetLines }: GuessListProps) {
  if (guesses.length === 0) return null;

  const sharedSegments = useMemo(() => buildSharedSegments(guesses), [guesses]);
  const revealedKeys = useMemo(() => getRevealedSegments(guesses), [guesses]);
  const guessedStationIds = useMemo(
    () => new Set(guesses.map((g) => g.stationId)),
    [guesses]
  );

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
              <RouteMap
                guessId={guess.stationId}
                segments={guess.hint.segments}
                revealedKeys={revealedKeys}
                showLines={showLines}
                revealMatchedSegments={revealMatchedSegments}
                revealedTargetLines={revealedTargetLines}
              />
              <div className="route-segments">
                {guess.hint.segments.map((seg, j) => {
                  const isLastSegment = j === guess.hint.segments.length - 1;
                  const shouldShowLines = showLines
                    || (revealMatchedSegments && !isLastSegment && sharedSegments.has(segmentKey(seg)));
                  const perLineReveal = !shouldShowLines && revealMatchedSegments && isLastSegment;

                  return (
                    <div key={j} className="segment">
                      <span className="segment-chevron">&#x25B8;</span>
                      <div className="segment-lines">
                        {shouldShowLines ? (
                          seg.lines.map((lineId, k) => (
                            <>
                              {k > 0 && <span key={`sep-${k}`} className="line-separator">/</span>}
                              <span
                                key={lineId}
                                className="line-badge"
                                style={{ backgroundColor: lines[lineId]?.colour ?? "#666", color: contrastingTextColor(lines[lineId]?.colour ?? "#666") }}
                                title={lines[lineId]?.name ?? lineId}
                              >
                                {lines[lineId]?.name ?? lineId}
                              </span>
                            </>
                          ))
                        ) : perLineReveal && seg.lines.some(l => revealedTargetLines.has(l)) ? (
                          seg.lines.map((lineId, k) => (
                            <>
                              {k > 0 && <span key={`sep-${k}`} className="line-separator">/</span>}
                              {revealedTargetLines.has(lineId) ? (
                                <span
                                  key={lineId}
                                  className="line-badge"
                                  style={{ backgroundColor: lines[lineId]?.colour ?? "#666", color: contrastingTextColor(lines[lineId]?.colour ?? "#666") }}
                                  title={lines[lineId]?.name ?? lineId}
                                >
                                  {lines[lineId]?.name ?? lineId}
                                </span>
                              ) : (
                                <span key={`hidden-${k}`} className="line-badge line-badge-hidden">???</span>
                              )}
                            </>
                          ))
                        ) : (
                          <span className="line-badge line-badge-hidden">???</span>
                        )}
                      </div>
                      <div className="segment-stops">
                        {seg.stops} {seg.stops === 1 ? "stop" : "stops"}
                      </div>
                      {revealStations ? (
                        <div className="segment-arrow">
                          {j < guess.hint.segments.length - 1
                            ? "change at " + (getStationName(seg.endStationId) ?? seg.endStationId)
                            : getStationName(seg.endStationId) ?? seg.endStationId}
                        </div>
                      ) : (
                        !isLastSegment && guessedStationIds.has(seg.endStationId) && (
                          <div className="segment-arrow">
                            change at {getStationName(seg.endStationId) ?? seg.endStationId}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="guess-footer">
                <div className="guess-total">
                  {guess.hint.totalStops} {guess.hint.totalStops === 1 ? "stop" : "stops"} away
                </div>
                <div className="guess-stats">
                  {guess.zone && (
                    <span
                      className="guess-zone"
                      title={
                        guess.zoneComparison === "higher"
                          ? "Target is in a lower zone"
                          : guess.zoneComparison === "lower"
                            ? "Target is in a higher zone"
                            : "Same zone as target"
                      }
                    >
                      Zone {guess.zone} {comparisonArrow(guess.zoneComparison)}
                    </span>
                  )}
                  {guess.ridership != null && (
                    <span
                      className="guess-ridership"
                      title={
                        guess.ridershipComparison === "higher"
                          ? "Target station is quieter"
                          : guess.ridershipComparison === "lower"
                            ? "Target station is busier"
                            : "Same ridership as target"
                      }
                    >
                      {formatRidership(guess.ridership)}/day {comparisonArrow(guess.ridershipComparison)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
