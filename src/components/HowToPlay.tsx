import { useState } from "react";

export default function HowToPlay() {
  const [isOpen, setIsOpen] = useState(
    () => localStorage.getItem("tuble-game") === null
  );

  return (
    <>
      <button
        className="header-icon-btn"
        onClick={() => setIsOpen(true)}
        aria-label="How to play"
        title="How to play"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
        </svg>
      </button>
      {isOpen && (
        <div className="settings-backdrop" onClick={() => setIsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <button className="settings-close" onClick={() => setIsOpen(false)}>
              &times;
            </button>
            <h2>How to play</h2>
            <p>
              Guess the mystery station in 8 tries. All London Underground,
              Elizabeth line, and DLR stations are included (but not Overground).
              After each guess you'll see the shortest route from your guess to
              the target, broken into segments with stop counts. Routes are
              chosen by fewest stops, but changing lines adds a penalty of
              3.5 stops.
            </p>
            <p>The 3-letter station code gives you a Wordle-style hint:</p>
            <ul className="hint-key">
              <li><span className="code-tile correct inline-tile">G</span> Right letter, right position</li>
              <li><span className="code-tile present inline-tile">Y</span> Right letter, wrong position</li>
              <li><span className="code-tile absent inline-tile">X</span> Letter not in the code</li>
            </ul>
            <h3>Zone &amp; ridership</h3>
            <p>
              Each guess shows the station's zone and average daily ridership. The
              arrows tell you whether the target is in a higher (▲) or lower (▼)
              zone, and whether it's busier or quieter.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
