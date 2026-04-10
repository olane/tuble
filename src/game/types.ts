/** A tube station */
export interface Station {
  id: string;
  name: string;
  zone: string;
  lines: string[];
}

/** A directed edge in the graph adjacency list */
export interface Edge {
  to: string;
  line: string;
}

/** The full tube graph as stored in tube-graph.json */
export interface TubeGraph {
  stations: Record<string, Station>;
  adjacency: Record<string, Edge[]>;
}

/** One segment of a route — a contiguous run on one or more parallel lines */
export interface RouteSegment {
  lines: string[];
  stops: number;
  endStationId: string;
  path: string[];
}

/** The hint shown to the player after a guess */
export interface RouteHint {
  segments: RouteSegment[];
  totalStops: number;
}

export type LetterStatus = "correct" | "present" | "absent";

export interface CodeHint {
  letters: { char: string; status: LetterStatus }[];
}

export type Comparison = "higher" | "lower" | "equal";

export interface GuessResult {
  stationId: string;
  correct: boolean;
  hint: RouteHint;
  codeHint: CodeHint;
  ridership: number;
  ridershipComparison: Comparison;
  zone: string;
  zoneComparison: Comparison;
  sharedLines: string[];
}

export interface GameState {
  targetId: string;
  guesses: GuessResult[];
  maxGuesses: number;
  status: "playing" | "won" | "lost";
}
