import { useEffect, useRef, useState } from "react";
import type { GameState } from "../game/types";
import type { Difficulty } from "../game/settings";
import { getTodayKey } from "../game/game";
import { formatRidership } from "../utils";

interface GameOverProps {
  state: GameState;
  difficulty: Difficulty;
  targetName: string;
  targetCode: string;
  targetZone: string;
  targetRidership: number;
}

function buildShareText(state: GameState, difficulty: Difficulty): string {
  const dateKey = getTodayKey();
  const won = state.status === "won";
  const score = won ? `${state.guesses.length}/${state.maxGuesses}` : `X/${state.maxGuesses}`;
  const diffLabel = difficulty === "easy" ? "🟢" : difficulty === "medium" ? "🟡" : "🔴";

  const rows = state.guesses.map((guess) => {
    const codePart = guess.codeHint?.letters
      .map((l) => {
        if (l.status === "correct") return "\uD83D\uDFE9";
        if (l.status === "present") return "\uD83D\uDFE8";
        return "\u2B1C";
      })
      .join("") ?? "";

    const trains = guess.correct
      ? `\u2705 ${score}`
      : guess.hint.segments.map(() => "\uD83D\uDE83").join("");

    return `${codePart} ${trains}`;
  });


  if (!won) {
    rows[rows.length - 1] += "\u274C";
  }

  return `Tuble ${dateKey}\n${rows.join("\n")}\n${diffLabel} ${difficulty} mode`;
}

export default function GameOver({ state, difficulty, targetName, targetCode, targetZone, targetRidership }: GameOverProps) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "playing") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [state.status]);

  if (state.status === "playing") return null;

  const won = state.status === "won";

  function handleShare() {
    const text = buildShareText(state, difficulty);
    if (navigator.share && "ontouchstart" in window) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="game-over-card" ref={cardRef}>
      <h2>{won ? "You got it!" : "Not this time"}</h2>
      <p className="game-over-answer">
        {won
          ? `You found ${targetName} in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}.`
          : `The answer was ${targetName}.`}
      </p>
      <div className="game-over-stats">
        <span className="code-tiles">
          {targetCode.split("").map((c, i) => (
            <span key={i} className="code-tile correct">{c}</span>
          ))}
        </span>
        <span>Zone {targetZone}</span>
        <span>{formatRidership(targetRidership)} riders/day</span>
      </div>
      <button className="share-btn" onClick={handleShare}>
        {copied ? "Copied!" : "Share"}
      </button>
      <p className="game-over-comeback">Come back tomorrow for a new puzzle!</p>
    </div>
  );
}
