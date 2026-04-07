import { useState, useRef, useEffect } from "react";

interface StationOption {
  id: string;
  name: string;
}

interface StationInputProps {
  stations: StationOption[];
  guessedIds: Set<string>;
  onGuess: (stationId: string) => void;
}

export default function StationInput({ stations, guessedIds, onGuess }: StationInputProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = query.length > 0
    ? stations.filter(
        (s) =>
          !guessedIds.has(s.id) &&
          s.name.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const visible = filtered.slice(0, 8);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

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
        placeholder="Guess a station..."
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
      {isOpen && visible.length > 0 && (
        <ul className="station-dropdown" ref={listRef}>
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
