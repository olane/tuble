import { useState, useMemo, useCallback } from "react";
import {
  getTodayKey,
  loadOrCreateGame,
  saveGame,
  makeGuess,
  getStationList,
  createGame,
} from "./game/game";
import { loadDifficulty, saveDifficulty, type Difficulty } from "./game/settings";
import { getStationName } from "./game/pathfinding";
import StationInput from "./components/StationInput";
import GuessList from "./components/GuessList";
import GameOver from "./components/GameOver";
import Settings from "./components/Settings";
import "./App.css";

const dateKey = getTodayKey();

function App() {
  const [gameState, setGameState] = useState(() => loadOrCreateGame(dateKey));
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty);
  const stations = useMemo(() => getStationList(), []);
  const guessedIds = useMemo(
    () => new Set(gameState.guesses.map((g) => g.stationId)),
    [gameState.guesses]
  );

  const handleGuess = useCallback(
    (stationId: string) => {
      const next = makeGuess(gameState, stationId);
      setGameState(next);
      saveGame(dateKey, next);
    },
    [gameState]
  );

  const handleDifficulty = useCallback((d: Difficulty) => {
    setDifficulty(d);
    saveDifficulty(d);
  }, []);

  const handleReset = useCallback(() => {
    const fresh = createGame(dateKey);
    setGameState(fresh);
    saveGame(dateKey, fresh);
  }, []);

  const targetName = getStationName(gameState.targetId) ?? gameState.targetId;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Tuble</h1>
        <p className="guess-counter">
          {gameState.guesses.length} / {gameState.maxGuesses}
        </p>
      </header>

      <GuessList
        guesses={gameState.guesses}
        getStationName={(id) => getStationName(id) ?? id}
        revealStations={gameState.status !== "playing"}
        showLines={difficulty === "easy" || gameState.status !== "playing"}
      />

      {gameState.status === "playing" && (
        <StationInput
          stations={stations}
          guessedIds={guessedIds}
          onGuess={handleGuess}
        />
      )}

      <GameOver state={gameState} targetName={targetName} />

      <div className="bottom-buttons">
        <Settings difficulty={difficulty} onChangeDifficulty={handleDifficulty} />
        <button className="bottom-btn" onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

export default App;
