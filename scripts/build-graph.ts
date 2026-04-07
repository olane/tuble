/**
 * Fetches London Underground topology from the TfL API and builds
 * src/data/tube-graph.json and src/data/lines.json.
 *
 * Usage: npx tsx scripts/build-graph.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const TFL_BASE = "https://api.tfl.gov.uk";

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

interface Station {
  id: string;
  name: string;
  zone: string;
  lines: string[];
}

interface Edge {
  to: string;
  line: string;
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

async function main() {
  console.log("Fetching line list from TfL API...");
  const lines = await fetchJson<{ id: string; name: string }[]>(
    `${TFL_BASE}/Line/Mode/tube,elizabeth-line`
  );
  console.log(`Found ${lines.length} lines: ${lines.map((l) => l.name).join(", ")}`);

  // Canonical station registry, keyed by topMostParentId (merges tube + elizabeth)
  // Maps topMostParentId -> station data
  const stationsByParentId = new Map<
    string,
    { name: string; zone: string; lines: Set<string> }
  >();
  // Maps each TfL stationId -> its canonical parentId
  const tflIdToParentId = new Map<string, string>();
  // Raw edges: [parentIdA, parentIdB, lineId] (deduplicated)
  const edgeSet = new Set<string>();
  const adjacency = new Map<string, Edge[]>();

  for (const line of lines) {
    console.log(`Fetching ${line.name}...`);

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
        if (!stops || stops.length === 0) continue;

        // Register all stations, merging by topMostParentId
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

        // Add adjacency edges for consecutive stations (using canonical parent IDs)
        for (let i = 0; i < stops.length - 1; i++) {
          const fromParent = tflIdToParentId.get(stops[i].stationId)!;
          const toParent = tflIdToParentId.get(stops[i + 1].stationId)!;
          if (fromParent === toParent) continue; // skip self-loops

          const keyA = `${fromParent}|${toParent}|${line.id}`;
          const keyB = `${toParent}|${fromParent}|${line.id}`;
          if (!edgeSet.has(keyA)) {
            edgeSet.add(keyA);
            edgeSet.add(keyB);
          }
        }
      }
    }
  }

  // Build slug mapping from canonical parentId
  const parentIdToSlug = new Map<string, string>();
  const slugCounts = new Map<string, number>();
  for (const [parentId, station] of stationsByParentId) {
    let slug = toSlug(station.name);
    const count = slugCounts.get(slug) || 0;
    if (count > 0) {
      slug = `${slug}-${count + 1}`;
    }
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

  // Build adjacency list from edge set
  for (const key of edgeSet) {
    const [fromParentId, toParentId, lineId] = key.split("|");
    const fromSlug = parentIdToSlug.get(fromParentId);
    const toSlug = parentIdToSlug.get(toParentId);
    if (!fromSlug || !toSlug) continue;

    const existing = adjacency.get(fromSlug)!;
    if (!existing.some((e) => e.to === toSlug && e.line === lineId)) {
      existing.push({ to: toSlug, line: lineId });
    }
  }

  // Build output
  const graph = {
    stations,
    adjacency: Object.fromEntries(adjacency),
  };

  const linesData: Record<string, { name: string; colour: string }> = {};
  for (const line of lines) {
    linesData[line.id] = {
      name: line.name,
      colour: LINE_COLOURS[line.id] || "#888888",
    };
  }

  // Write files
  const outDir = join(import.meta.dirname, "..", "src", "data");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "tube-graph.json"), JSON.stringify(graph, null, 2));
  writeFileSync(join(outDir, "lines.json"), JSON.stringify(linesData, null, 2));

  // Stats
  const stationCount = Object.keys(stations).length;
  const edgeCount = [...adjacency.values()].reduce((sum, edges) => sum + edges.length, 0) / 2;
  console.log(`\n✓ Generated tube-graph.json: ${stationCount} stations, ${edgeCount} edges`);
  console.log(`✓ Generated lines.json: ${Object.keys(linesData).length} lines`);

  // Sanity checks
  const orphans = Object.keys(stations).filter(
    (s) => (adjacency.get(s)?.length ?? 0) === 0
  );
  if (orphans.length > 0) {
    console.warn(`\n⚠ Orphan stations (no edges): ${orphans.map((s) => stations[s].name).join(", ")}`);
  }

  // Check connectivity with BFS from first station
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
      `\n⚠ Graph is not fully connected! ${unreachable.length} unreachable stations from ${stations[allSlugs[0]].name}:`
    );
    console.warn(unreachable.map((s) => `  - ${stations[s].name}`).join("\n"));
  } else {
    console.log(`✓ Graph is fully connected`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
