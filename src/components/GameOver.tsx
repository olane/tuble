import type { GameState } from "../game/types";

interface GameOverProps {
  state: GameState;
  targetName: string;
}

export default function GameOver({ state, targetName }: GameOverProps) {
  if (state.status === "playing") return null;

  const won = state.status === "won";

  return (
    <div className="game-over-card">
      <h2>{won ? "You got it!" : "Not this time"}</h2>
      <p className="game-over-answer">
        {won
          ? `You found ${targetName} in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}.`
          : `The answer was ${targetName}.`}
      </p>
      <p className="game-over-comeback">Come back tomorrow for a new puzzle!</p>
    </div>
  );
}
