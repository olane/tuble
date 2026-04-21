# Tuble

A Tube-themed puzzle game built with React and Vite.

## Setup

```bash
npm install
```

### Generate game data

The game relies on four data files in `src/data/` that are checked in to the repo. You only need to regenerate them if the tube network topology changes or you want to refresh ridership numbers.

Data generation is a two-step process:

**Step 1 — Fetch raw TfL data** (requires network access):

```bash
npm run fetch-tfl                         # graph data only
npm run fetch-tfl -- --metadata           # also fetch coordinates & boroughs
```

This caches TfL API responses into `scripts/tfl-cache/`. The `--metadata` flag fetches station coordinates and reverse-geocodes boroughs (slow — ~1 req/sec rate limit).

**Step 2 — Build game data** from the cache (no network needed):

```bash
npm run build-data -- --graph-only        # graph + lines only
npm run build-data -- footfall.csv        # all four data files
```

This reads from `scripts/tfl-cache/` and writes into `src/data/`:

- `tube-graph.json` — station topology and adjacency graph
- `lines.json` — line names and colours
- `station-metadata.json` — lat/lon coordinates and borough (requires `--metadata` fetch)
- `ridership.json` — average daily ridership per station (requires a footfall CSV)

## Development

```bash
npm run dev
```

## Testing

```bash
npm test
```
