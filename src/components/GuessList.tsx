import type { GuessResult } from "../game/types";
import linesData from "../data/lines.json";

const lines = linesData as Record<string, { name: string; colour: string }>;

interface GuessListProps {
  guesses: GuessResult[];
  getStationName: (id: string) => string | undefined;
  revealStations: boolean;
  showLines: boolean;
}

export default function GuessList({ guesses, getStationName, revealStations, showLines }: GuessListProps) {
  if (guesses.length === 0) return null;

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
                {guess.hint.segments.map((seg, j) => (
                  <div key={j} className="segment">
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
                    {revealStations && (
                      <div className="segment-arrow">
                        {j < guess.hint.segments.length - 1 ? "change at " + (getStationName(seg.endStationId) ?? seg.endStationId) : getStationName(seg.endStationId) ?? seg.endStationId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="guess-total">
                {guess.hint.totalStops} {guess.hint.totalStops === 1 ? "stop" : "stops"} away
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
