/**
 * Builds all generated data files for Tuble from cached TfL API data.
 *
 * Reads from scripts/tfl-cache/ (populated by fetch-tfl.ts) — no network
 * access needed. This means the script can run in sandboxed environments.
 *
 * Generates:
 *   src/data/tube-graph.json       — station topology and adjacency
 *   src/data/lines.json            — line names and colours
 *   src/data/station-metadata.json — lat/lon coordinates and borough
 *   src/data/ridership.json        — average daily ridership per station
 *
 * Usage:
 *   npx tsx scripts/build-data.ts --graph-only
 *   npx tsx scripts/build-data.ts <footfall.csv>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(import.meta.dirname, "tfl-cache");
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

function readCache<T>(filename: string): T {
  const path = join(CACHE_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(
      `Cache file not found: ${path}\nRun "npx tsx scripts/fetch-tfl.ts" first.`
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
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
  dlr: "#00A4A7",
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

interface TflRouteSection {
  name: string;
  direction: string;
  originationName: string;
  destinationName: string;
  serviceType: string;
}

/**
 * A through-route as defined by the TfL /Line/{id}/Route API.
 * Represents a single end-to-end train service (e.g. "Morden to High Barnet").
 */
interface ThroughRoute {
  lineId: string;
  originSlug: string;
  destSlug: string;
  via: string | null;
  slug: string;
}

/**
 * Parse the TfL Route API response into deduplicated through-routes.
 * The API returns inbound/outbound pairs — we normalise to a single
 * entry per service.
 */
function parseThroughRoutes(
  lineId: string,
  routeData: { routeSections: TflRouteSection[] },
  slugLookup: (name: string) => string | undefined
): ThroughRoute[] {
  const seen = new Set<string>();
  const routes: ThroughRoute[] = [];

  for (const section of routeData.routeSections) {
    if (section.serviceType !== "Regular") continue;

    const originSlug = slugLookup(section.originationName);
    const destSlug = slugLookup(section.destinationName);
    if (!originSlug || !destSlug) continue;

    // Normalise: sort termini lexicographically to dedup inbound/outbound
    const [lo, hi] = originSlug < destSlug
      ? [originSlug, destSlug]
      : [destSlug, originSlug];

    // Extract "via" from the route name (e.g. "Morden - High Barnet via Charing Cross")
    const viaMatch = section.name.match(/\bvia\s+(.+)$/i);
    const via = viaMatch ? toSlug(viaMatch[1]) : null;

    const key = `${lineId}|${lo}|${hi}|${via ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const slug = via
      ? `${lineId}:${lo}-${hi}-via-${via}`
      : `${lineId}:${lo}-${hi}`;

    routes.push({ lineId, originSlug: lo, destSlug: hi, via, slug });
  }

  return routes;
}

/**
 * Assign through-route branch slugs to edges.
 *
 * For each through-route (e.g. "Morden → High Barnet"), we find which
 * sequence fragments lie on its path by BFS through the fragment-endpoint
 * graph. A fragment belongs to a through-route if both its termini are
 * reachable from the route's origin on the way to its destination.
 *
 * Trunk edges (shared by multiple through-routes) naturally get multiple
 * slugs. Branch-exclusive edges get only the slugs of through-routes that
 * traverse them.
 */
function assignBranchSlugs(
  throughRoutes: ThroughRoute[],
  lineId: string,
  _adjacencyByLine: Map<string, Set<string>>,
  sequences: { stopSlugs: string[] }[],
  addBranch: (key: string, branch: string) => void
): void {
  // Dedup sequences: outbound [A,B,C] and inbound [C,B,A] are the same.
  const seen = new Set<string>();
  const dedupedSeqs: { stopSlugs: string[] }[] = [];
  for (const seq of sequences) {
    const first = seq.stopSlugs[0];
    const last = seq.stopSlugs[seq.stopSlugs.length - 1];
    const [lo, hi] = first < last ? [first, last] : [last, first];
    const key = `${lo}|${hi}|${seq.stopSlugs.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedSeqs.push(seq);
    }
  }

  // Build a fragment-endpoint graph: nodes are fragment termini, edges
  // connect first↔last of each fragment. Used to determine reachability
  // between through-route termini and fragment termini.
  const fragAdj = new Map<string, Set<string>>();
  for (const seq of dedupedSeqs) {
    const first = seq.stopSlugs[0];
    const last = seq.stopSlugs[seq.stopSlugs.length - 1];
    if (!fragAdj.has(first)) fragAdj.set(first, new Set());
    if (!fragAdj.has(last)) fragAdj.set(last, new Set());
    fragAdj.get(first)!.add(last);
    fragAdj.get(last)!.add(first);
  }

  // For each through-route, BFS through the fragment-endpoint graph to find
  // the shortest chain of fragments from origin to destination. Only
  // fragments on this chain get the through-route's slug.
  //
  // Index fragments by their termini pair for lookup after BFS.
  const fragsByEndpoints = new Map<string, { stopSlugs: string[] }[]>();
  for (const seq of dedupedSeqs) {
    const first = seq.stopSlugs[0];
    const last = seq.stopSlugs[seq.stopSlugs.length - 1];
    for (const key of [`${first}|${last}`, `${last}|${first}`]) {
      if (!fragsByEndpoints.has(key)) fragsByEndpoints.set(key, []);
      fragsByEndpoints.get(key)!.push(seq);
    }
  }

  for (const route of throughRoutes) {
    // BFS at the fragment-endpoint level: find ALL shortest paths from
    // origin to destination. We need all paths because through-routes like
    // "Morden→High Barnet" have multiple physical variants (via Bank, via CC).
    const dist = new Map<string, number>();
    const parents = new Map<string, string[]>();
    const queue = [route.originSlug];
    dist.set(route.originSlug, 0);
    parents.set(route.originSlug, []);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const d = dist.get(current)!;
      for (const nbr of fragAdj.get(current) ?? []) {
        const prevDist = dist.get(nbr);
        if (prevDist === undefined) {
          dist.set(nbr, d + 1);
          parents.set(nbr, [current]);
          queue.push(nbr);
        } else if (prevDist === d + 1) {
          parents.get(nbr)!.push(current);
        }
      }
    }

    let target = route.destSlug;
    if (!dist.has(target)) {
      // Try reverse
      target = route.originSlug;
      dist.clear();
      parents.clear();
      queue.push(route.destSlug);
      dist.set(route.destSlug, 0);
      parents.set(route.destSlug, []);
      while (queue.length > 0) {
        const current = queue.shift()!;
        const d = dist.get(current)!;
        for (const nbr of fragAdj.get(current) ?? []) {
          const prevDist = dist.get(nbr);
          if (prevDist === undefined) {
            dist.set(nbr, d + 1);
            parents.set(nbr, [current]);
            queue.push(nbr);
          } else if (prevDist === d + 1) {
            parents.get(nbr)!.push(current);
          }
        }
      }
    }

    if (!dist.has(target)) {
      console.warn(`    ⚠ No path for ${route.slug}`);
      continue;
    }

    // Collect ALL fragment-endpoint pairs on ANY shortest path by walking
    // backward through all parents from the target.
    const edgePairs = new Set<string>();
    const backtrack = [target];
    const visited = new Set<string>();
    while (backtrack.length > 0) {
      const node = backtrack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const p of parents.get(node) ?? []) {
        edgePairs.add(`${p}|${node}`);
        edgePairs.add(`${node}|${p}`);
        backtrack.push(p);
      }
    }

    // For each fragment-endpoint pair on a shortest path, tag the fragment
    for (const pairKey of edgePairs) {
      const frags = fragsByEndpoints.get(pairKey) ?? [];
      for (const frag of frags) {
        for (let j = 0; j < frag.stopSlugs.length - 1; j++) {
          addBranch(`${frag.stopSlugs[j]}|${frag.stopSlugs[j + 1]}|${lineId}`, route.slug);
          addBranch(`${frag.stopSlugs[j + 1]}|${frag.stopSlugs[j]}|${lineId}`, route.slug);
        }
      }
    }
  }
}

function buildGraphAndLines(): {
  stations: Record<string, Station>;
  adjacency: Map<string, Edge[]>;
  linesData: Record<string, { name: string; colour: string }>;
  parentIdToSlug: Map<string, string>;
} {
  console.log("Reading cached TfL data...");
  const lines = readCache<{ id: string; name: string }[]>("lines.json");
  console.log(`  ${lines.length} lines: ${lines.map((l) => l.name).join(", ")}`);

  const stationsByParentId = new Map<
    string,
    { name: string; zone: string; lines: Set<string> }
  >();
  const tflIdToParentId = new Map<string, string>();
  const lineSequences: { lineId: string; stopParentIds: string[] }[] = [];
  const adjacency = new Map<string, Edge[]>();

  // ── Step 1: Build stations and raw edge set from Route/Sequence data ──

  for (const line of lines) {
    for (const direction of ["outbound", "inbound"] as const) {
      let routeSeq: TflRouteSequence;
      try {
        routeSeq = readCache<TflRouteSequence>(
          `route-sequence/${line.id}-${direction}.json`
        );
      } catch {
        continue;
      }

      for (const seq of routeSeq.stopPointSequences) {
        const stops = seq.stopPoint;
        if (!stops || stops.length < 2) continue;

        for (const stop of stops) {
          const parentId =
            stop.topMostParentId || stop.parentId || stop.stationId;
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

  // ── Step 2: Build slug mapping ──

  const parentIdToSlug = new Map<string, string>();
  const slugCounts = new Map<string, number>();
  for (const [parentId, station] of stationsByParentId) {
    let slug = toSlug(station.name);
    const count = slugCounts.get(slug) || 0;
    if (count > 0) slug = `${slug}-${count + 1}`;
    slugCounts.set(slug, count + 1);
    parentIdToSlug.set(parentId, slug);
  }

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

  // ── Step 3: Build per-line adjacency (edge set without branches) ──
  //
  // We need the raw edge topology so we can BFS through it when assigning
  // through-routes to edges. Deduplicate edges across sequences.

  const edgeSet = new Set<string>();
  const adjacencyByLine = new Map<string, Map<string, Set<string>>>();
  const sequencesByLine = new Map<string, { stopSlugs: string[] }[]>();

  for (const seq of lineSequences) {
    const slugs: string[] = [];
    for (const parentId of seq.stopParentIds) {
      const slug = parentIdToSlug.get(parentId);
      if (!slug) continue;
      if (slugs.length === 0 || slugs[slugs.length - 1] !== slug) {
        slugs.push(slug);
      }
    }

    // Collect slug sequences grouped by line (dedup later)
    if (slugs.length >= 2) {
      if (!sequencesByLine.has(seq.lineId)) {
        sequencesByLine.set(seq.lineId, []);
      }
      sequencesByLine.get(seq.lineId)!.push({ stopSlugs: slugs });
    }

    for (let i = 0; i < slugs.length - 1; i++) {
      const from = slugs[i];
      const to = slugs[i + 1];
      const lineId = seq.lineId;
      const keyA = `${from}|${to}|${lineId}`;
      const keyB = `${to}|${from}|${lineId}`;
      if (!edgeSet.has(keyA)) {
        edgeSet.add(keyA);
        edgeSet.add(keyB);
      }

      // Build per-line adjacency for BFS
      if (!adjacencyByLine.has(lineId)) {
        adjacencyByLine.set(lineId, new Map());
      }
      const lineAdj = adjacencyByLine.get(lineId)!;
      if (!lineAdj.has(from)) lineAdj.set(from, new Set());
      if (!lineAdj.has(to)) lineAdj.set(to, new Set());
      lineAdj.get(from)!.add(to);
      lineAdj.get(to)!.add(from);
    }
  }

  // ── Step 4: Assign branch slugs from TfL through-routes ──
  //
  // The TfL /Line/{id}/Route API tells us the actual end-to-end services
  // (e.g. "Morden to High Barnet via Charing Cross"). For each through-route,
  // we BFS from origin to destination on the line's edge topology and tag
  // every edge on the path with the through-route's branch slug.
  //
  // This replaces the old approach of deriving branch slugs from sequence
  // termini + heuristic propagation. The Route API is the ground truth for
  // which stations are connected by a single train service.

  const edgeBranches = new Map<string, Set<string>>();
  const addBranch = (key: string, branch: string) => {
    let set = edgeBranches.get(key);
    if (!set) {
      set = new Set();
      edgeBranches.set(key, set);
    }
    set.add(branch);
  };

  // Build a lookup from station name → slug for matching Route API names
  const nameToSlug = new Map<string, string>();
  for (const [slug, station] of Object.entries(stations)) {
    nameToSlug.set(station.name, slug);
  }
  const slugFromName = (name: string): string | undefined => {
    // Try direct match first, then slug conversion
    const direct = nameToSlug.get(cleanStationName(name));
    if (direct) return direct;
    const slug = toSlug(name);
    return stations[slug] ? slug : undefined;
  };

  for (const line of lines) {
    let routeData: { routeSections: TflRouteSection[] };
    try {
      routeData = readCache<{ routeSections: TflRouteSection[] }>(
        `routes/${line.id}.json`
      );
    } catch {
      console.warn(`  ⚠ No route data for ${line.name}, skipping branch assignment`);
      continue;
    }

    const throughRoutes = parseThroughRoutes(line.id, routeData, slugFromName);
    const lineAdj = adjacencyByLine.get(line.id);
    if (!lineAdj) continue;

    console.log(
      `  ${line.name}: ${throughRoutes.length} through-routes`
    );

    const lineSeqs = sequencesByLine.get(line.id) ?? [];
    assignBranchSlugs(throughRoutes, line.id, lineAdj, lineSeqs, addBranch);
  }

  // ── Step 5: Build final adjacency list ──
  //
  // For edges that have no through-route assignments (e.g. if the Route API
  // didn't cover them), fall back to a generic branch slug.

  for (const key of edgeSet) {
    const [from, to, lineId] = key.split("|");
    // Only process one direction (from < to) to avoid duplicates
    if (from > to) continue;

    const fwdKey = `${from}|${to}|${lineId}`;
    const branches = edgeBranches.get(fwdKey);

    if (!branches || branches.size === 0) {
      // Fallback: edge not covered by any through-route
      const fallback = `${lineId}:unassigned`;
      addBranch(fwdKey, fallback);
      addBranch(`${to}|${from}|${lineId}`, fallback);
    }
  }

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

  // ── Stats & sanity checks ──

  const stationCount = Object.keys(stations).length;
  const edgeCount =
    [...adjacency.values()].reduce((sum, edges) => sum + edges.length, 0) / 2;
  console.log(`\n✓ Graph: ${stationCount} stations, ${edgeCount} edges`);

  const orphans = Object.keys(stations).filter(
    (s) => (adjacency.get(s)?.length ?? 0) === 0
  );
  if (orphans.length > 0) {
    console.warn(
      `⚠ Orphan stations (no edges): ${orphans.map((s) => stations[s].name).join(", ")}`
    );
  }

  // Connectivity check
  const allSlugs = Object.keys(stations);
  const visited = new Set<string>();
  const bfsQueue = [allSlugs[0]];
  visited.add(allSlugs[0]);
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    for (const edge of adjacency.get(current) || []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        bfsQueue.push(edge.to);
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

  // Check for unassigned edges
  let unassignedCount = 0;
  for (const [, branchSet] of edgeBranches) {
    if (branchSet.has("unassigned")) unassignedCount++;
  }
  if (unassignedCount > 0) {
    console.warn(`⚠ ${unassignedCount / 2} edges not covered by any through-route`);
  }

  console.log(`✓ Lines: ${Object.keys(linesData).length} lines`);

  return { stations, adjacency, linesData, parentIdToSlug };
}

// ── Station metadata (coordinates & borough) ────────────────────────

interface StationMetadata {
  lat: number;
  lon: number;
  borough: string;
}

function buildMetadata(
  stations: Record<string, Station>
): Record<string, StationMetadata> {
  console.log("\nBuilding station metadata from cache...");

  const stopPointData = readCache<{
    stopPoints: { commonName: string; lat: number; lon: number; id: string }[];
  }>("stoppoints.json");
  const stopPoints = stopPointData.stopPoints;
  console.log(`  ${stopPoints.length} stop points`);

  const tflBySlug = new Map<
    string,
    { commonName: string; lat: number; lon: number }
  >();
  for (const sp of stopPoints) {
    tflBySlug.set(toSlug(sp.commonName), sp);
  }

  const metadata: Record<string, StationMetadata> = {};

  for (const id of Object.keys(stations)) {
    const sp = tflBySlug.get(id);
    if (sp) {
      metadata[id] = { lat: sp.lat, lon: sp.lon, borough: "" };
    } else {
      metadata[id] = { lat: 0, lon: 0, borough: "Unknown" };
    }
  }

  // Assign boroughs from cache
  try {
    const boroughs = readCache<Record<string, string>>("boroughs.json");
    for (const [id, meta] of Object.entries(metadata)) {
      if (meta.lat === 0) continue;
      const sp = tflBySlug.get(id);
      if (sp && boroughs[sp.commonName]) {
        meta.borough = boroughs[sp.commonName];
      }
    }
  } catch {
    console.warn(
      '  ⚠ No boroughs.json cache — run "npx tsx scripts/fetch-tfl.ts --metadata"'
    );
  }

  const found = Object.values(metadata).filter((m) => m.lat !== 0).length;
  const withBorough = Object.values(metadata).filter(
    (m) => m.borough && m.borough !== "Unknown" && m.borough !== ""
  ).length;
  console.log(
    `✓ Metadata: ${found}/${Object.keys(stations).length} with coordinates, ${withBorough} with borough`
  );

  return metadata;
}

// ── Ridership ───────────────────────────────────────────────────────

function buildRidership(
  csvPath: string,
  stations: Record<string, Station>
): Record<string, number> {
  console.log(`\nBuilding ridership from ${csvPath}...`);

  const csv = readFileSync(csvPath, "utf8");
  const csvLines = csv.trim().split("\n");

  const totals: Record<string, number> = {};
  const days: Record<string, number> = {};

  for (let i = 1; i < csvLines.length; i++) {
    const cols = csvLines[i].split(",");
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
    woolwich: "Woolwich Elizabeth Line",
    "custom-house": "Custom House Elizabeth Line",
    watford: "Watford Met",
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
    console.error(
      "\nAdd manual mappings in this script for the above stations."
    );
    process.exit(1);
  }

  console.log(`✓ Ridership: ${Object.keys(result).length} stations`);
  return result;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
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

  const { stations, adjacency, linesData } = buildGraphAndLines();
  writeJson("tube-graph.json", {
    stations,
    adjacency: Object.fromEntries(adjacency),
  });
  writeJson("lines.json", linesData);

  if (graphOnly) {
    console.log("\n✓ Graph-only rebuild complete.");
    return;
  }

  const metadata = buildMetadata(stations);
  const ridership = buildRidership(csvPath!, stations);
  const sortedMetadata = Object.fromEntries(
    Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b))
  );
  writeJson("station-metadata.json", sortedMetadata);
  writeJson("ridership.json", ridership);

  console.log("\nDone!");
}

main();
