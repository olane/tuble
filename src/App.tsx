import { useState, useMemo, useCallback } from "react";
import {
  getTodayKey,
  loadOrCreateGame,
  saveGame,
  makeGuess,
  getStationList,
  createGame,
  randomGame,
  getStationCode,
} from "./game/game";
import { loadDifficulty, saveDifficulty, type Difficulty } from "./game/settings";
import { getStationName, graph } from "./game/pathfinding";
import ridershipData from "./data/ridership.json";
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

  const handleNewStation = useCallback(() => {
    const fresh = randomGame();
    setGameState(fresh);
    saveGame(dateKey, fresh);
  }, []);

  const revealedTargetLines = useMemo(() => {
    const targetLines = new Set(graph.stations[gameState.targetId]?.lines ?? []);
    const revealed = new Set<string>();
    for (const guess of gameState.guesses) {
      const guessLines = graph.stations[guess.stationId]?.lines ?? [];
      for (const line of guessLines) {
        if (targetLines.has(line)) {
          revealed.add(line);
        }
      }
    }
    return revealed;
  }, [gameState.guesses, gameState.targetId]);

  const targetName = getStationName(gameState.targetId) ?? gameState.targetId;
  const targetCode = getStationCode(gameState.targetId) ?? "???";
  const targetZone = graph.stations[gameState.targetId]?.zone ?? "?";
  const targetRidership = (ridershipData as Record<string, number>)[gameState.targetId] ?? 0;

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
        revealMatchedSegments={difficulty === "medium"}
        revealedTargetLines={revealedTargetLines}
      />

      {gameState.status === "playing" && (
        <StationInput
          stations={stations}
          guessedIds={guessedIds}
          onGuess={handleGuess}
        />
      )}

      <GameOver
        state={gameState}
        difficulty={difficulty}
        targetName={targetName}
        targetCode={targetCode}
        targetZone={targetZone}
        targetRidership={targetRidership}
      />

      <div className="bottom-buttons">
        <Settings difficulty={difficulty} onChangeDifficulty={handleDifficulty} />
        <button className="bottom-btn" onClick={handleReset}>
          Reset
        </button>
        <button className="bottom-btn" onClick={handleNewStation}>
          New station
        </button>
      </div>

      <footer className="app-footer">
        <p>Built by <a href="https://github.com/olane">Oli</a>. Inspired heavily by <a href="https://loconundrum.aaronc.cc/">Loconundrum</a>.</p>
        <p>Powered by TfL Open Data. Contains OS data &copy; Crown copyright and database rights 2016 and Geomni UK Map data &copy; and database rights [2019].</p>
      </footer>
    </div>
  );
}

export default App;
