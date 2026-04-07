import { useState } from "react";
import type { Difficulty } from "../game/settings";

interface SettingsProps {
  difficulty: Difficulty;
  onChangeDifficulty: (d: Difficulty) => void;
}

export default function Settings({ difficulty, onChangeDifficulty }: SettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button className="bottom-btn" onClick={() => setIsOpen(true)}>
        How to play
      </button>
      {isOpen && (
        <div className="settings-backdrop" onClick={() => setIsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <button className="settings-close" onClick={() => setIsOpen(false)}>
              &times;
            </button>
            <h2>How to play</h2>
            <p>
              Guess the mystery London Underground station in 6 tries. After each
              guess you'll see the shortest route from your guess to the target,
              broken into segments with stop counts. Routes are chosen by
              fewest stops, but changing lines adds a penalty of 1.5 stops.
            </p>
            <p>The 3-letter station code gives you a Wordle-style hint:</p>
            <ul className="hint-key">
              <li><span className="code-tile correct inline-tile">G</span> Right letter, right position</li>
              <li><span className="code-tile present inline-tile">Y</span> Right letter, wrong position</li>
              <li><span className="code-tile absent inline-tile">X</span> Letter not in the code</li>
            </ul>
            <h3>Ridership</h3>
            <p>
              Each guess shows the station's average daily ridership. The arrow tells
              you whether the target station is busier (▲) or quieter (▼).
            </p>
            <h3>Difficulty</h3>
            <ul className="difficulty-key">
              <li><strong>Easy</strong> — tube line names shown on each segment</li>
              <li><strong>Medium</strong> — lines hidden, but if two guesses share the same segment the line is revealed</li>
              <li><strong>Hard</strong> — lines hidden until the game ends</li>
            </ul>
            <div className="difficulty-toggle">
              <button
                className={`difficulty-btn ${difficulty === "easy" ? "active" : ""}`}
                onClick={() => onChangeDifficulty("easy")}
              >
                Easy
              </button>
              <button
                className={`difficulty-btn ${difficulty === "medium" ? "active" : ""}`}
                onClick={() => onChangeDifficulty("medium")}
              >
                Medium
              </button>
              <button
                className={`difficulty-btn ${difficulty === "hard" ? "active" : ""}`}
                onClick={() => onChangeDifficulty("hard")}
              >
                Hard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
