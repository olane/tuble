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
import type { GameState } from "./game/types";
import { loadDifficulty, saveDifficulty, type Difficulty } from "./game/settings";
import { getStationName, graph } from "./game/pathfinding";
import ridershipData from "./data/ridership.json";
import StationInput from "./components/StationInput";
import GuessList from "./components/GuessList";
import GameOver from "./components/GameOver";
import Settings from "./components/Settings";
import HowToPlay from "./components/HowToPlay";
import RouteTestPage from "./pages/RouteTestPage";
import RouteGalleryPage from "./pages/RouteGalleryPage";
import "./App.css";

const dateKey = getTodayKey();

const isDevMode = import.meta.env.DEV ||
  new URLSearchParams(window.location.search).has("dev");

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/test") {
    return <RouteTestPage params={new URLSearchParams(window.location.search)} />;
  }
  if (path === "/gallery") {
    return <RouteGalleryPage />;
  }
  return <GamePage />;
}

function GamePage() {
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

  const startGame = useCallback((state: GameState) => {
    setGameState(state);
    saveGame(dateKey, state);
  }, []);

  const handleReset = useCallback(() => {
    startGame(createGame(dateKey));
  }, [startGame]);

  const handleNewStation = useCallback(() => {
    startGame(randomGame());
  }, [startGame]);

  const revealedTargetLines = useMemo(() => {
    const revealed = new Set<string>();
    for (const guess of gameState.guesses) {
      if (guess.correct) continue;
      // Only reveal when the route is a direct connection (no interchange)
      if (guess.hint.segments.length === 1) {
        for (const line of guess.hint.segments[0].lines) {
          revealed.add(line);
        }
      }
    }
    return revealed;
  }, [gameState.guesses]);

  const targetName = getStationName(gameState.targetId) ?? gameState.targetId;
  const targetCode = getStationCode(gameState.targetId) ?? "???";
  const targetZone = graph.stations[gameState.targetId]?.zone ?? "?";
  const targetRidership = (ridershipData as Record<string, number>)[gameState.targetId] ?? 0;
  const targetLines = graph.stations[gameState.targetId]?.lines ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1>Tuble</h1>
          <div className="header-icons">
            <HowToPlay />
            <Settings difficulty={difficulty} onChangeDifficulty={handleDifficulty} />
          </div>
        </div>
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
          guessNumber={gameState.guesses.length + 1}
          maxGuesses={gameState.maxGuesses}
        />
      )}

      <GameOver
        state={gameState}
        difficulty={difficulty}
        targetName={targetName}
        targetCode={targetCode}
        targetZone={targetZone}
        targetRidership={targetRidership}
        targetLines={targetLines}
      />

      {isDevMode && (
        <div className="bottom-buttons">
          <button className="bottom-btn" onClick={handleReset}>
            Reset
          </button>
          <button className="bottom-btn" onClick={handleNewStation}>
            New station
          </button>
        </div>
      )}

      <footer className="app-footer">
        <p>Built by <a href="https://olane.dev">Oli</a>. Inspired heavily by <a href="https://loconundrum.aaronc.cc/">Loconundrum</a>.</p>
        <p>Powered by TfL Open Data. Contains OS data &copy; Crown copyright and database rights 2016 and Geomni UK Map data &copy; and database rights [2019].</p>
      </footer>
    </div>
  );
}
