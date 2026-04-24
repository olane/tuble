import { describe, it, expect } from "vitest";
import { createElement } from "react";
import GameOver from "../../src/components/GameOver";
import type { GameState, GuessResult } from "../../src/game/types";
import { renderMarkup, compareMarkupToBaseline } from "./utils";

function dummyGuess(stationId: string, correct: boolean): GuessResult {
  return {
    stationId,
    correct,
    hint: { segments: [], totalStops: 0 },
    codeHint: { letters: [] },
    ridership: 0,
    ridershipComparison: "equal",
    zone: "1",
    zoneComparison: "equal",
  };
}

const cases = [
  {
    name: "won_single_line",
    state: {
      targetId: "lambeth-north",
      guesses: [dummyGuess("lambeth-north", true)],
      maxGuesses: 8,
      status: "won",
    } satisfies GameState,
    targetName: "Lambeth North",
    targetCode: "LBN",
    targetZone: "1",
    targetRidership: 12000,
    targetLines: ["bakerloo"],
  },
  {
    name: "won_multi_line",
    state: {
      targetId: "waterloo",
      guesses: [
        dummyGuess("baker-street", false),
        dummyGuess("waterloo", true),
      ],
      maxGuesses: 8,
      status: "won",
    } satisfies GameState,
    targetName: "Waterloo",
    targetCode: "WLO",
    targetZone: "1",
    targetRidership: 92000,
    targetLines: ["bakerloo", "jubilee", "northern", "waterloo-city"],
  },
  {
    name: "lost_multi_line",
    state: {
      targetId: "kings-cross-st-pancras",
      guesses: Array.from({ length: 8 }, (_, i) =>
        dummyGuess(`guess-${i}`, false),
      ),
      maxGuesses: 8,
      status: "lost",
    } satisfies GameState,
    targetName: "King's Cross St. Pancras",
    targetCode: "KXX",
    targetZone: "1",
    targetRidership: 150000,
    targetLines: [
      "circle",
      "hammersmith-city",
      "metropolitan",
      "northern",
      "piccadilly",
      "victoria",
    ],
  },
];

describe("GameOver card visual regression", () => {
  for (const c of cases) {
    it(c.name, () => {
      const element = createElement(GameOver, {
        state: c.state,
        difficulty: "medium",
        targetName: c.targetName,
        targetCode: c.targetCode,
        targetZone: c.targetZone,
        targetRidership: c.targetRidership,
        targetLines: c.targetLines,
      });

      const markup = renderMarkup(element);
      const result = compareMarkupToBaseline(`gameOver__${c.name}`, markup);

      if (!result.matched) {
        expect.fail(result.message ?? "Markup mismatch");
      }
    });
  }
});
