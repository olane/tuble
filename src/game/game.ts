import type { GameState, GuessResult, RouteHint, CodeHint, LetterStatus } from "./types";
import { findRoute, getAllStationIds, graph } from "./pathfinding";
import stationCodes from "../data/station-codes.json";

const MAX_GUESSES = 6;
const STORAGE_KEY = "tuble-game";

/**
 * Simple seeded PRNG (mulberry32).
 * Returns a function that produces deterministic floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Get today's date string in YYYY-MM-DD format (local time).
 */
export function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Convert a date key to a numeric seed.
 */
function dateSeed(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Pick the target station for a given date.
 */
export function getTargetForDate(dateKey: string): string {
  const ids = getAllStationIds();
  const rng = mulberry32(dateSeed(dateKey));
  const index = Math.floor(rng() * ids.length);
  return ids[index];
}

/**
 * Create a fresh game state for a given date.
 */
export function createGame(dateKey: string): GameState {
  return {
    targetId: getTargetForDate(dateKey),
    guesses: [],
    maxGuesses: MAX_GUESSES,
    status: "playing",
  };
}

/**
 * Process a guess against the current game state.
 * Returns a new GameState (does not mutate the input).
 */
export function makeGuess(state: GameState, stationId: string): GameState {
  if (state.status !== "playing") {
    throw new Error("Game is already over");
  }

  if (!graph.stations[stationId]) {
    throw new Error(`Unknown station: ${stationId}`);
  }

  if (state.guesses.some((g) => g.stationId === stationId)) {
    throw new Error(`Already guessed: ${stationId}`);
  }

  const correct = stationId === state.targetId;
  const hints: RouteHint[] = findRoute(stationId, state.targetId);
  // Use the first route as the hint
  const hint = hints[0];
  const codeHint = compareStationCodes(stationId, state.targetId);

  const result: GuessResult = { stationId, correct, hint, codeHint };
  const guesses = [...state.guesses, result];

  let status: GameState["status"] = "playing";
  if (correct) {
    status = "won";
  } else if (guesses.length >= state.maxGuesses) {
    status = "lost";
  }

  return { ...state, guesses, status };
}

/**
 * Get all station names for autocomplete, sorted alphabetically.
 */
export function getStationList(): { id: string; name: string }[] {
  return Object.entries(graph.stations)
    .map(([id, station]) => ({ id, name: station.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const codes = stationCodes as Record<string, string>;

/**
 * Get the 3-letter code for a station.
 */
export function getStationCode(id: string): string | undefined {
  return codes[id];
}

/**
 * Wordle-style comparison of two station codes.
 * Green = correct letter in correct position.
 * Yellow = letter exists in target code but wrong position.
 * Grey = letter not in target code.
 */
function compareStationCodes(guessId: string, targetId: string): CodeHint {
  const guessCode = codes[guessId];
  const targetCode = codes[targetId];

  if (!guessCode || !targetCode) {
    return { letters: [] };
  }

  const guess = guessCode.split("");
  const target = targetCode.split("");
  const result: { char: string; status: LetterStatus }[] = guess.map((c) => ({
    char: c,
    status: "absent" as LetterStatus,
  }));

  // Track which target letters are still available for "present" matching
  const remaining = [...target];

  // First pass: mark correct (green)
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) {
      result[i].status = "correct";
      remaining[i] = "";
    }
  }

  // Second pass: mark present (yellow)
  for (let i = 0; i < guess.length; i++) {
    if (result[i].status === "correct") continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx !== -1) {
      result[i].status = "present";
      remaining[idx] = "";
    }
  }

  return { letters: result };
}

// --- localStorage persistence ---

interface SavedState {
  dateKey: string;
  game: GameState;
}

/**
 * Save game state to localStorage.
 */
export function saveGame(dateKey: string, state: GameState): void {
  const data: SavedState = { dateKey, game: state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Load today's game from localStorage, or create a new one.
 */
export function loadOrCreateGame(dateKey: string): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved: SavedState = JSON.parse(raw);
      if (saved.dateKey === dateKey) {
        return saved.game;
      }
    }
  } catch {
    // Corrupted data — start fresh
  }
  return createGame(dateKey);
}
