export type Difficulty = "easy" | "hard";

const STORAGE_KEY = "tuble-difficulty";

export function loadDifficulty(): Difficulty {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "easy" || val === "hard") return val;
  } catch {
    // ignore
  }
  return "easy";
}

export function saveDifficulty(d: Difficulty): void {
  localStorage.setItem(STORAGE_KEY, d);
}
