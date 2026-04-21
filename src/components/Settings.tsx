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
      <button
        className="header-icon-btn"
        onClick={() => setIsOpen(true)}
        aria-label="Settings"
        title="Settings"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.04 7.04 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.04 7.04 0 0 0-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58a7.07 7.07 0 0 0-.06.94c0 .32.02.64.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54a7.04 7.04 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
        </svg>
      </button>
      {isOpen && (
        <div className="settings-backdrop" onClick={() => setIsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <button className="settings-close" onClick={() => setIsOpen(false)}>
              &times;
            </button>
            <h2>Settings</h2>
            <h3>Difficulty</h3>
            <ul className="difficulty-key">
              <li><strong>Easy</strong> — tube line names shown on each segment</li>
              <li><strong>Medium</strong> — lines hidden, but intermediate segments are revealed when shared across guesses. The target's line is only revealed when you guess a station with a direct connection (no interchange needed)</li>
              <li><strong>Hard</strong> — lines hidden until the game ends</li>
            </ul>
            <div className="difficulty-toggle">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  className={`difficulty-btn ${difficulty === d ? "active" : ""}`}
                  onClick={() => onChangeDifficulty(d)}
                >
                  {d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
