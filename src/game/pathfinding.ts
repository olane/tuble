import type { TubeGraph, RouteSegment, RouteHint } from "./types";
import graphData from "../data/tube-graph.json";

const graph: TubeGraph = graphData as TubeGraph;

export { graph };

interface HeapEntry {
  stationId: string;
  line: string | null;
  cost: number;
}

/** Min-heap keyed on entry.cost */
class MinHeap {
  private heap: HeapEntry[] = [];

  get size() {
    return this.heap.length;
  }

  push(entry: HeapEntry) {
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapEntry {
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[i].cost >= this.heap[parent].cost) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].cost < this.heap[smallest].cost)
        smallest = left;
      if (right < n && this.heap[right].cost < this.heap[smallest].cost)
        smallest = right;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

const LINE_CHANGE_PENALTY = 1.5;

function stateKey(stationId: string, line: string | null): string {
  return `${stationId}:${line ?? "*"}`;
}

function parseStateKey(key: string): { stationId: string; line: string | null } {
  const i = key.lastIndexOf(":");
  const line = key.slice(i + 1);
  return { stationId: key.slice(0, i), line: line === "*" ? null : line };
}

/**
 * Dijkstra shortest path(s) from `fromId` to `toId`.
 * Each stop costs 1, and each line change costs an additional 1.5.
 * Returns all equally-weighted optimal routes.
 * Throws if no path exists.
 */
export function findRoute(fromId: string, toId: string): RouteHint[] {
  if (fromId === toId) {
    return [{ segments: [], totalStops: 0 }];
  }

  if (!graph.adjacency[fromId]) {
    throw new Error(`Unknown station: ${fromId}`);
  }
  if (!graph.adjacency[toId]) {
    throw new Error(`Unknown station: ${toId}`);
  }

  // Track best cost and all optimal parents for each (station, line) state
  const best = new Map<string, number>();
  const parents = new Map<string, string[]>();

  const startKey = stateKey(fromId, null);
  const queue = new MinHeap();
  queue.push({ stationId: fromId, line: null, cost: 0 });
  best.set(startKey, 0);
  parents.set(startKey, []);

  let bestTargetCost = Infinity;

  while (queue.size > 0) {
    const current = queue.pop();

    const key = stateKey(current.stationId, current.line);

    // Once we've exceeded the best target cost, we're done
    if (current.cost > bestTargetCost) break;

    // Skip if we've already settled a better path to this state
    if (current.cost > (best.get(key) ?? Infinity)) continue;

    // If this is the target, record its cost but don't expand further
    if (current.stationId === toId) {
      bestTargetCost = current.cost;
      continue;
    }

    for (const edge of graph.adjacency[current.stationId] ?? []) {
      const isChange =
        current.line !== null && current.line !== edge.line;
      const nextCost = current.cost + 1 + (isChange ? LINE_CHANGE_PENALTY : 0);

      if (nextCost > bestTargetCost) continue;

      const nextKey = stateKey(edge.to, edge.line);
      const prevBest = best.get(nextKey) ?? Infinity;

      if (nextCost < prevBest) {
        // Found a strictly better path — replace parents
        best.set(nextKey, nextCost);
        parents.set(nextKey, [key]);
        queue.push({ stationId: edge.to, line: edge.line, cost: nextCost });
      } else if (nextCost === prevBest) {
        // Found an equally good path — add parent
        parents.get(nextKey)!.push(key);
      }
    }
  }

  // Collect all target state keys that achieved the best cost
  const targetKeys: string[] = [];
  for (const [key, cost] of best) {
    const { stationId } = parseStateKey(key);
    if (stationId === toId && cost === bestTargetCost) {
      targetKeys.push(key);
    }
  }

  if (targetKeys.length === 0) {
    throw new Error(`No route found from ${fromId} to ${toId}`);
  }

  // Reconstruct all paths by walking backwards through parents
  const allPaths: { line: string; stationId: string }[][] = [];

  function reconstruct(key: string, path: { line: string; stationId: string }[]) {
    const parentList = parents.get(key);
    if (!parentList || parentList.length === 0) {
      // Reached the start
      allPaths.push([...path].reverse());
      return;
    }
    const { stationId, line } = parseStateKey(key);
    for (const parentKey of parentList) {
      path.push({ line: line!, stationId });
      reconstruct(parentKey, path);
      path.pop();
    }
  }

  for (const targetKey of targetKeys) {
    reconstruct(targetKey, []);
  }

  // Convert paths to single-line segments first
  interface RawSegment { line: string; stops: number; endStationId: string; path: string[] }
  const rawRoutes: { segments: RawSegment[]; totalStops: number }[] = [];
  const seenRaw = new Set<string>();

  for (const edges of allPaths) {
    const segments: RawSegment[] = [];
    for (const edge of edges) {
      const last = segments[segments.length - 1];
      if (last && last.line === edge.line) {
        last.stops++;
        last.endStationId = edge.stationId;
        last.path.push(edge.stationId);
      } else {
        segments.push({ line: edge.line, stops: 1, endStationId: edge.stationId, path: [edge.stationId] });
      }
    }
    const key = JSON.stringify(segments);
    if (!seenRaw.has(key)) {
      seenRaw.add(key);
      rawRoutes.push({ segments, totalStops: edges.length });
    }
  }

  // Merge routes that only differ by which line is used on a segment.
  // Shape key: stops and endStationIds, ignoring lines.
  const shapeGroups = new Map<string, typeof rawRoutes>();
  for (const route of rawRoutes) {
    const shapeKey = route.segments
      .map((s) => `${s.stops}:${s.endStationId}`)
      .join("|");
    let group = shapeGroups.get(shapeKey);
    if (!group) {
      group = [];
      shapeGroups.set(shapeKey, group);
    }
    group.push(route);
  }

  const hints: RouteHint[] = [];
  for (const group of shapeGroups.values()) {
    const base = group[0];
    const segments: RouteSegment[] = base.segments.map((s) => ({
      lines: [s.line],
      stops: s.stops,
      endStationId: s.endStationId,
      path: s.path,
    }));
    // Merge lines from other routes in the same shape group
    for (let r = 1; r < group.length; r++) {
      for (let i = 0; i < segments.length; i++) {
        const line = group[r].segments[i].line;
        if (!segments[i].lines.includes(line)) {
          segments[i].lines.push(line);
        }
      }
    }
    // Sort lines alphabetically for stable output
    for (const seg of segments) {
      seg.lines.sort();
    }
    hints.push({ segments, totalStops: base.totalStops });
  }

  return hints;
}

/**
 * Get all station IDs.
 */
export function getAllStationIds(): string[] {
  return Object.keys(graph.stations);
}

/**
 * Get station name by ID.
 */
export function getStationName(id: string): string | undefined {
  return graph.stations[id]?.name;
}
