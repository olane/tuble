/**
 * Builds all generated data files for Tuble from the TfL API.
 *
 * Generates:
 *   src/data/tube-graph.json       — station topology and adjacency
 *   src/data/lines.json            — line names and colours
 *   src/data/station-metadata.json — lat/lon coordinates and borough
 *   src/data/ridership.json        — average daily ridership per station
 *
 * Usage:
 *   npx tsx scripts/build-data.ts <footfall.csv>
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const TFL_BASE = "https://api.tfl.gov.uk";
const OUT_DIR = join(import.meta.dirname, "..", "src", "data");

// ── Shared types & helpers ──────────────────────────────────────────

interface Station {
  id: string;
  name: string;
  zone: string;
  lines: string[];
}

interface Edge {
  to: string;
  line: string;
  branches: string[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function toSlug(stationName: string): string {
  return stationName
    .replace(/\s+Underground\s+Station$/i, "")
    .replace(/\s+Rail\s+Station$/i, "")
    .replace(/\s+DLR\s+Station$/i, "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cleanStationName(name: string): string {
  return name
    .replace(/\s+Underground\s+Station$/i, "")
    .replace(/\s+Rail\s+Station$/i, "")
    .replace(/\s+DLR\s+Station$/i, "");
}

function writeJson(filename: string, data: unknown): void {
  writeFileSync(join(OUT_DIR, filename), JSON.stringify(data, null, 2) + "\n");
}

// ── Graph & lines ───────────────────────────────────────────────────

const LINE_COLOURS: Record<string, string> = {
  bakerloo: "#B36305",
  central: "#E32017",
  circle: "#FFD300",
  district: "#00782A",
  "hammersmith-city": "#F3A9BB",
  jubilee: "#A0A5A9",
  metropolitan: "#9B0056",
  northern: "#000000",
  piccadilly: "#003688",
  victoria: "#0098D4",
  "waterloo-city": "#95CDBA",
  elizabeth: "#6950A1",
};

interface TflStopPoint {
  stationId: string;
  parentId: string;
  topMostParentId: string;
  name: string;
  zone: string;
  lines: { id: string; name: string }[];
  lat: number;
  lon: number;
}

interface TflStopPointSequence {
  stopPoint: TflStopPoint[];
}

interface TflRouteSequence {
  lineId: string;
  lineName: string;
  stopPointSequences: TflStopPointSequence[];
}

/**
 * Derive a stable branch slug for a single TfL stopPointSequence. The slug is
 * a canonical identifier for the train service that runs end-to-end on that
 * sequence, so edges shared by multiple services list multiple branches.
 *
 * Strategy: sort the two terminus slugs lexicographically, then add a `via-*`
 * suffix for lines whose services share termini but diverge through the
 * middle (Northern via Bank/Charing Cross, Central via the Hainault loop).
 */
function deriveBranchSlug(lineId: string, stopSlugs: string[]): string {
  const a = stopSlugs[0];
  const b = stopSlugs[stopSlugs.length - 1];
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const via = deriveVia(lineId, stopSlugs);
  return via ? `${lineId}:${lo}-${hi}-${via}` : `${lineId}:${lo}-${hi}`;
}

function deriveVia(lineId: string, stopSlugs: string[]): string | null {
  if (lineId === "northern") {
    if (stopSlugs.includes("bank")) return "via-bank";
    if (stopSlugs.includes("charing-cross")) return "via-charing-cross";
  }
  if (lineId === "central") {
    // Hainault-loop services traverse Hainault as a non-terminal stop;
    // straight services terminate there (or don't touch it).
    const last = stopSlugs.length - 1;
    const hainaultMid = stopSlugs.some(
      (s, i) => s === "hainault" && i !== 0 && i !== last
    );
    if (hainaultMid) return "via-hainault";
  }
  return null;
}

/**
 * Chain sequences on the same line that share an endpoint into longer
 * through-running services. For example if the TfL API returns:
 *   [A, B, C] and [C, D, E]  (same line)
 * we merge them into [A, B, C, D, E].
 *
 * Greedy: repeatedly find a pair that can be joined (the last stop of one
 * equals the first stop of the other) and merge until no more joins are
 * possible. Works across any number of fragments.
 */
function chainSequences(
  sequences: { lineId: string; stopSlugs: string[] }[]
): { lineId: string; stopSlugs: string[] }[] {
  // Deduplicate: outbound [A,B,C] and inbound [C,B,A] are the same service.
  // Canonicalise by sorting the first/last stop pair and joining all slugs.
  const seen = new Set<string>();
  const deduped: { lineId: string; stopSlugs: string[] }[] = [];
  for (const seq of sequences) {
    const first = seq.stopSlugs[0];
    const last = seq.stopSlugs[seq.stopSlugs.length - 1];
    const [lo, hi] = first < last ? [first, last] : [last, first];
    const key = `${seq.lineId}|${lo}|${hi}|${seq.stopSlugs.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(seq);
    }
  }

  // Group by line so we only try to chain within the same line.
  const byLine = new Map<string, { stopSlugs: string[] }[]>();
  for (const seq of deduped) {
    let group = byLine.get(seq.lineId);
    if (!group) {
      group = [];
      byLine.set(seq.lineId, group);
    }
    group.push({ stopSlugs: [...seq.stopSlugs] });
  }

  const result: { lineId: string; stopSlugs: string[] }[] = [];

  for (const [lineId, seqs] of byLine) {
    // Greedily chain: index sequences by their first stop slug.
    let changed = true;
    while (changed) {
      changed = false;
      const byFirst = new Map<string, number>();
      for (let i = 0; i < seqs.length; i++) {
        byFirst.set(seqs[i].stopSlugs[0], i);
      }
      for (let i = 0; i < seqs.length; i++) {
        const tail = seqs[i].stopSlugs[seqs[i].stopSlugs.length - 1];
        const j = byFirst.get(tail);
        if (j !== undefined && j !== i) {
          // Merge j onto the end of i (skip the shared stop).
          seqs[i].stopSlugs.push(...seqs[j].stopSlugs.slice(1));
          seqs.splice(j, 1);
          changed = true;
          break;
        }
      }
    }

    for (const seq of seqs) {
      result.push({ lineId, stopSlugs: seq.stopSlugs });
    }
  }

  return result;
}

async function buildGraphAndLines(): Promise<{
  stations: Record<string, Station>;
  adjacency: Map<string, Edge[]>;
  linesData: Record<string, { name: string; colour: string }>;
  parentIdToSlug: Map<string, string>;
}> {
  console.log("Fetching line list from TfL API...");
  const lines = await fetchJson<{ id: string; name: string }[]>(
    `${TFL_BASE}/Line/Mode/tube,elizabeth-line`
  );
  console.log(`Found ${lines.length} lines: ${lines.map((l) => l.name).join(", ")}`);

  const stationsByParentId = new Map<
    string,
    { name: string; zone: string; lines: Set<string> }
  >();
  const tflIdToParentId = new Map<string, string>();
  const lineSequences: { lineId: string; stopParentIds: string[] }[] = [];
  const adjacency = new Map<string, Edge[]>();

  for (const line of lines) {
    console.log(`  Fetching ${line.name}...`);

    for (const direction of ["outbound", "inbound"] as const) {
      let routeSeq: TflRouteSequence;
      try {
        routeSeq = await fetchJson<TflRouteSequence>(
          `${TFL_BASE}/Line/${line.id}/Route/Sequence/${direction}`
        );
      } catch (e) {
        console.warn(`  ⚠ Failed to fetch ${direction} for ${line.name}: ${e}`);
        continue;
      }

      for (const seq of routeSeq.stopPointSequences) {
        const stops = seq.stopPoint;
        if (!stops || stops.length < 2) continue;

        for (const stop of stops) {
          const parentId = stop.topMostParentId || stop.parentId || stop.stationId;
          tflIdToParentId.set(stop.stationId, parentId);

          const existing = stationsByParentId.get(parentId);
          if (existing) {
            existing.lines.add(line.id);
          } else {
            stationsByParentId.set(parentId, {
              name: cleanStationName(stop.name),
              zone: stop.zone || "?",
              lines: new Set([line.id]),
            });
          }
        }

        const parentIds = stops.map(
          (s) => tflIdToParentId.get(s.stationId)!
        );
        lineSequences.push({ lineId: line.id, stopParentIds: parentIds });
      }
    }
  }

  // Build slug mapping
  const parentIdToSlug = new Map<string, string>();
  const slugCounts = new Map<string, number>();
  for (const [parentId, station] of stationsByParentId) {
    let slug = toSlug(station.name);
    const count = slugCounts.get(slug) || 0;
    if (count > 0) slug = `${slug}-${count + 1}`;
    slugCounts.set(slug, count + 1);
    parentIdToSlug.set(parentId, slug);
  }

  // Build station records
  const stations: Record<string, Station> = {};
  for (const [parentId, data] of stationsByParentId) {
    const slug = parentIdToSlug.get(parentId)!;
    stations[slug] = {
      id: slug,
      name: data.name,
      zone: data.zone,
      lines: [...data.lines].sort(),
    };
    adjacency.set(slug, []);
  }

  // Walk each sequence, derive a branch slug, and attach it to every edge
  // the sequence traverses (in both directions).
  const edgeBranches = new Map<string, Set<string>>();
  const addBranch = (key: string, branch: string) => {
    let set = edgeBranches.get(key);
    if (!set) {
      set = new Set();
      edgeBranches.set(key, set);
    }
    set.add(branch);
  };

  // Convert parentId sequences to slug sequences.
  const slugSequences: { lineId: string; stopSlugs: string[] }[] = [];
  for (const seq of lineSequences) {
    const stopSlugs: string[] = [];
    for (const parentId of seq.stopParentIds) {
      const slug = parentIdToSlug.get(parentId);
      if (!slug) continue;
      if (stopSlugs.length === 0 || stopSlugs[stopSlugs.length - 1] !== slug) {
        stopSlugs.push(slug);
      }
    }
    if (stopSlugs.length >= 2) {
      slugSequences.push({ lineId: seq.lineId, stopSlugs });
    }
  }

  // Chain sequences on the same line that share an endpoint. The TfL API
  // sometimes returns through-running services (e.g. Elizabeth line) as
  // multiple short fragments. Chaining them avoids spurious branch slugs.
  const chained = chainSequences(slugSequences);

  for (const seq of chained) {
    const branchSlug = deriveBranchSlug(seq.lineId, seq.stopSlugs);
    for (let i = 0; i < seq.stopSlugs.length - 1; i++) {
      const from = seq.stopSlugs[i];
      const to = seq.stopSlugs[i + 1];
      addBranch(`${from}|${to}|${seq.lineId}`, branchSlug);
      addBranch(`${to}|${from}|${seq.lineId}`, branchSlug);
    }
  }

  // Build adjacency list
  for (const [key, branchSet] of edgeBranches) {
    const [from, to, lineId] = key.split("|");
    const edges = adjacency.get(from);
    if (!edges) continue;
    if (edges.some((e) => e.to === to && e.line === lineId)) continue;
    edges.push({ to, line: lineId, branches: [...branchSet].sort() });
  }

  const linesData: Record<string, { name: string; colour: string }> = {};
  for (const line of lines) {
    linesData[line.id] = {
      name: line.name,
      colour: LINE_COLOURS[line.id] || "#888888",
    };
  }

  // Stats & sanity checks
  const stationCount = Object.keys(stations).length;
  const edgeCount = [...adjacency.values()].reduce((sum, edges) => sum + edges.length, 0) / 2;
  console.log(`\n✓ Graph: ${stationCount} stations, ${edgeCount} edges`);

  const orphans = Object.keys(stations).filter(
    (s) => (adjacency.get(s)?.length ?? 0) === 0
  );
  if (orphans.length > 0) {
    console.warn(`⚠ Orphan stations (no edges): ${orphans.map((s) => stations[s].name).join(", ")}`);
  }

  // Connectivity check
  const allSlugs = Object.keys(stations);
  const visited = new Set<string>();
  const queue = [allSlugs[0]];
  visited.add(allSlugs[0]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) || []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  if (visited.size !== allSlugs.length) {
    const unreachable = allSlugs.filter((s) => !visited.has(s));
    console.warn(
      `⚠ Graph not fully connected! ${unreachable.length} unreachable from ${stations[allSlugs[0]].name}:`
    );
    console.warn(unreachable.map((s) => `  - ${stations[s].name}`).join("\n"));
  } else {
    console.log(`✓ Graph is fully connected`);
  }

  console.log(`✓ Lines: ${Object.keys(linesData).length} lines`);

  return { stations, adjacency, linesData, parentIdToSlug };
}

// ── Station metadata (coordinates & borough) ────────────────────────

interface TflModeStopPoint {
  commonName: string;
  lat: number;
  lon: number;
  id: string;
}

interface StationMetadata {
  lat: number;
  lon: number;
  borough: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reverseGeocodeBorough(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
  const res = await fetch(url, {
    headers: { "User-Agent": "tuble-build-script" },
  });
  if (!res.ok) return "Unknown";
  const data = (await res.json()) as {
    address?: {
      city_district?: string;
      borough?: string;
      city?: string;
      town?: string;
      county?: string;
    };
  };
  const a = data.address;
  const raw = a?.city_district ?? a?.borough ?? a?.city ?? a?.town ?? a?.county ?? "Unknown";
  return raw
    .replace(/^London Borough of\s+/i, "")
    .replace(/^Royal Borough of\s+/i, "");
}

async function buildMetadata(
  stations: Record<string, Station>
): Promise<Record<string, StationMetadata>> {
  // Step 1: Get coordinates from TfL
  console.log("\nFetching station coordinates from TfL API...");

  const response = await fetchJson<{ stopPoints: TflModeStopPoint[] }>(
    `${TFL_BASE}/StopPoint/Mode/tube,elizabeth-line`
  );
  const stopPoints = response.stopPoints;
  console.log(`  Fetched ${stopPoints.length} stop points`);

  const tflBySlug = new Map<string, TflModeStopPoint>();
  for (const sp of stopPoints) {
    tflBySlug.set(toSlug(sp.commonName), sp);
  }

  const metadata: Record<string, StationMetadata> = {};
  const missing: string[] = [];

  for (const id of Object.keys(stations)) {
    const sp = tflBySlug.get(id);
    if (sp) {
      metadata[id] = { lat: sp.lat, lon: sp.lon, borough: "" };
    } else {
      missing.push(`${id} (${stations[id].name})`);
      metadata[id] = { lat: 0, lon: 0, borough: "Unknown" };
    }
  }

  // Try individual lookups for unmatched stations
  if (missing.length > 0) {
    console.warn(`  ⚠ ${missing.length} stations not matched in bulk, trying individual lookups...`);
    for (const id of Object.keys(stations)) {
      if (metadata[id].lat !== 0) continue;
      const station = stations[id];
      try {
        const results = await fetchJson<{ matches: { id: string; lat: number; lon: number }[] }>(
          `${TFL_BASE}/StopPoint/Search/${encodeURIComponent(station.name)}?modes=tube,elizabeth-line&maxResults=1`
        );
        if (results.matches && results.matches.length > 0) {
          const detail = await fetchJson<TflModeStopPoint>(
            `${TFL_BASE}/StopPoint/${results.matches[0].id}`
          );
          metadata[id] = { lat: detail.lat, lon: detail.lon, borough: "" };
          console.log(`    ✓ Found ${station.name}`);
        } else {
          console.warn(`    ✗ Could not find ${station.name}`);
        }
      } catch {
        console.warn(`    ✗ Could not find ${station.name}`);
      }
    }
  }

  const found = Object.values(metadata).filter((m) => m.lat !== 0).length;
  console.log(`✓ Coordinates: ${found}/${Object.keys(stations).length} stations`);

  // Step 2: Reverse geocode boroughs from Nominatim (1 req/sec rate limit)
  const ids = Object.keys(metadata).filter((id) => metadata[id].lat !== 0);
  console.log(`\nReverse geocoding boroughs for ${ids.length} stations (this takes a few minutes)...`);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const { lat, lon } = metadata[id];
    metadata[id].borough = await reverseGeocodeBorough(lat, lon);
    if ((i + 1) % 25 === 0 || i === ids.length - 1) {
      console.log(`  ${i + 1}/${ids.length}`);
    }
    if (i < ids.length - 1) await sleep(1000);
  }

  const withBorough = Object.values(metadata).filter((m) => m.borough !== "Unknown").length;
  console.log(`✓ Metadata: ${withBorough}/${Object.keys(stations).length} stations with borough`);

  return metadata;
}

// ── Ridership ───────────────────────────────────────────────────────

function buildRidership(
  csvPath: string,
  stations: Record<string, Station>
): Record<string, number> {
  console.log(`\nBuilding ridership from ${csvPath}...`);

  const csv = readFileSync(csvPath, "utf8");
  const lines = csv.trim().split("\n");

  const totals: Record<string, number> = {};
  const days: Record<string, number> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const station = cols[2];
    const entry = parseInt(cols[3]) || 0;
    const exit = parseInt(cols[4]) || 0;
    totals[station] = (totals[station] ?? 0) + entry + exit;
    days[station] = (days[station] ?? 0) + 1;
  }

  const avgs: Record<string, number> = {};
  for (const [s, t] of Object.entries(totals)) {
    avgs[s] = Math.round(t / days[s]);
  }

  function norm(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const csvByNorm: Record<string, string> = {};
  for (const name of Object.keys(avgs)) {
    csvByNorm[norm(name)] = name;
  }

  const manual: Record<string, string> = {
    "edgware-road-bakerloo": "Edgware Road B",
    "edgware-road-circle-line": "Edgware Road C&H",
    "shepherds-bush-central": "Shepherds Bush",
    "hammersmith-handc-line": "Hammersmith C&H",
    "burnham-berks": "Burnham Bucks",
    "woolwich": "Woolwich Elizabeth Line",
    "custom-house": "Custom House Elizabeth Line",
    "watford": "Watford Met",
  };

  const result: Record<string, number> = {};
  const unmatched: string[] = [];

  for (const [id, station] of Object.entries(stations)) {
    const n = norm(station.name);
    if (csvByNorm[n]) {
      result[id] = avgs[csvByNorm[n]];
    } else if (manual[id] && avgs[manual[id]] !== undefined) {
      result[id] = avgs[manual[id]];
    } else {
      unmatched.push(`${id} (${station.name})`);
    }
  }

  if (unmatched.length > 0) {
    console.error("Unmatched stations:");
    unmatched.forEach((s) => console.error(`  ${s}`));
    console.error("\nAdd manual mappings in this script for the above stations.");
    process.exit(1);
  }

  console.log(`✓ Ridership: ${Object.keys(result).length} stations`);
  return result;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const graphOnly = args.includes("--graph-only");
  const csvPath = args.find((a) => !a.startsWith("--"));

  if (!graphOnly && !csvPath) {
    console.error(
      "Usage: npx tsx scripts/build-data.ts <footfall.csv> [--graph-only]"
    );
    console.error("       npx tsx scripts/build-data.ts --graph-only");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const { stations, adjacency, linesData } = await buildGraphAndLines();
  writeJson("tube-graph.json", {
    stations,
    adjacency: Object.fromEntries(adjacency),
  });
  writeJson("lines.json", linesData);

  if (graphOnly) {
    console.log("\n✓ Graph-only rebuild complete.");
    return;
  }

  const metadata = await buildMetadata(stations);
  const ridership = buildRidership(csvPath!, stations);
  const sortedMetadata = Object.fromEntries(
    Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b))
  );
  writeJson("station-metadata.json", sortedMetadata);
  writeJson("ridership.json", ridership);

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
