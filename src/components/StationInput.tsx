import { useState, useRef, useEffect, useCallback } from "react";

interface StationOption {
  id: string;
  name: string;
  code?: string;
}

const MAX_SUGGESTIONS = 25;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
}

function filterAndRank(
  stations: StationOption[],
  query: string,
  guessedIds: Set<string>
): StationOption[] {
  const q = normalize(query);
  const codeQuery = query.trim().toUpperCase();
  const matches: { station: StationOption; rank: number }[] = [];

  for (const s of stations) {
    if (guessedIds.has(s.id)) continue;

    const isExactCode = s.code !== undefined && s.code === codeQuery;
    const name = normalize(s.name);
    const nameMatches = name.includes(q);
    if (!isExactCode && !nameMatches) continue;

    // Rank: exact code match (0), starts-with (1), word-boundary (2), substring (3)
    let rank = 3;
    if (isExactCode) {
      rank = 0;
    } else if (name.startsWith(q)) {
      rank = 1;
    } else if (name.includes(" " + q)) {
      rank = 2;
    }
    matches.push({ station: s, rank });
  }

  matches.sort((a, b) => a.rank - b.rank || a.station.name.localeCompare(b.station.name));
  return matches.slice(0, MAX_SUGGESTIONS).map((m) => m.station);
}

interface StationInputProps {
  stations: StationOption[];
  guessedIds: Set<string>;
  onGuess: (stationId: string) => void;
  guessNumber: number;
  maxGuesses: number;
}

export default function StationInput({ stations, guessedIds, onGuess, guessNumber, maxGuesses }: StationInputProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = query.length > 0
    ? filterAndRank(stations, query, guessedIds)
    : [];

  const dropdownVisible = isOpen && visible.length > 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const dropdownRef = useCallback((node: HTMLUListElement | null) => {
    listRef.current = node;
    if (node) {
      // Brief delay to let the browser's native focus-scroll settle first
      setTimeout(() => {
        node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  }, []);

  function submit(station: StationOption) {
    onGuess(station.id);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || visible.length === 0) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, visible.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        submit(visible[highlightIndex]);
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  }

  return (
    <div className="station-input">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={
          guessNumber > 1
            ? `Guess a station… (${guessNumber}/${maxGuesses})`
            : "Guess a station…"
        }
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          // Delay to allow click on dropdown item
          setTimeout(() => setIsOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {dropdownVisible && (
        <ul className="station-dropdown" ref={dropdownRef}>
          {visible.map((s, i) => (
            <li
              key={s.id}
              className={i === highlightIndex ? "highlighted" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(s);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
