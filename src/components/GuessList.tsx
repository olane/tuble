import { useMemo } from "react";
import type { GuessResult } from "../game/types";
import linesData from "../data/lines.json";
import RouteMap, { getRevealedSegments, contrastingTextColor, segmentKey } from "./RouteMap";
import { formatRidership } from "../utils";

const lines = linesData as Record<string, { name: string; colour: string }>;

function comparisonArrow(c: "higher" | "lower" | "equal"): string {
  if (c === "higher") return "\u25BC";
  if (c === "lower") return "\u25B2";
  return "=";
}

interface GuessListProps {
  guesses: GuessResult[];
  getStationName: (id: string) => string | undefined;
  revealStations: boolean;
  showLines: boolean;
  revealMatchedSegments: boolean;
  revealedTargetLines: Set<string>;
}

function LineBadge({ lineId }: { lineId: string }) {
  const colour = lines[lineId]?.colour ?? "#666";
  return (
    <span
      className="line-badge"
      style={{ backgroundColor: colour, color: contrastingTextColor(colour) }}
      title={lines[lineId]?.name ?? lineId}
    >
      {lines[lineId]?.name ?? lineId}
    </span>
  );
}

export default function GuessList({ guesses, getStationName, revealStations, showLines, revealMatchedSegments, revealedTargetLines }: GuessListProps) {
  if (guesses.length === 0) return null;

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
                  const segKey = segmentKey(seg);
                  const shouldShowLines = showLines
                    || (revealMatchedSegments && !isLastSegment && revealedKeys.has(segKey));
                  const perLineReveal = !shouldShowLines && revealMatchedSegments && isLastSegment;

                  const endRevealed = isLastSegment
                    ? revealStations
                    : revealStations || guessedStationIds.has(seg.endStationId);
                  const endText = endRevealed
                    ? (getStationName(seg.endStationId) ?? seg.endStationId)
                    : isLastSegment
                      ? "?"
                      : "";

                  return (
                    <div key={j} className="segment">
                      <div className="segment-lines">
                        {shouldShowLines ? (
                          seg.lines.map((lineId, k) => (
                            <>
                              {k > 0 && <span key={`sep-${k}`} className="line-separator">/</span>}
                              <LineBadge key={lineId} lineId={lineId} />
                            </>
                          ))
                        ) : perLineReveal && seg.lines.some(l => revealedTargetLines.has(l)) ? (
                          seg.lines.map((lineId, k) => (
                            <>
                              {k > 0 && <span key={`sep-${k}`} className="line-separator">/</span>}
                              {revealedTargetLines.has(lineId) ? (
                                <LineBadge key={lineId} lineId={lineId} />
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
                      <span className="segment-chevron">&#x25B8;</span>
                      <div className="segment-end">{endText}</div>
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
