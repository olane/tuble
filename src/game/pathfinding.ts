import type { TubeGraph, RouteSegment, RouteHint } from "./types";
import graphData from "../data/tube-graph.json";

// Cast via `unknown` because the committed tube-graph.json is a snapshot
// that may be produced by an older build without `branches` on each edge.
// Runtime validation in findRoute throws if an edge is missing branches,
// which is exactly what we want — regenerate the data.
const graph: TubeGraph = graphData as unknown as TubeGraph;

export { graph };

interface HeapEntry {
  stationId: string;
  line: string | null;
  branch: string | null;
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

const LINE_CHANGE_PENALTY = 3.5;
const BRANCH_CHANGE_PENALTY = 2.0;

function stateKey(stationId: string, line: string | null, branch: string | null): string {
  return `${stationId}\t${line ?? ""}\t${branch ?? ""}`;
}

function parseStateKey(key: string): {
  stationId: string;
  line: string | null;
  branch: string | null;
} {
  const [stationId, line, branch] = key.split("\t");
  return {
    stationId,
    line: line === "" ? null : line,
    branch: branch === "" ? null : branch,
  };
}

/**
 * Dijkstra shortest path(s) from `fromId` to `toId`.
 *
 * Cost model: 1 per stop, +3.5 for a full line change, +2.0 for a same-line
 * branch change (e.g. staying on the Northern line but swapping from the
 * Edgware branch to the High Barnet branch at Camden Town).
 *
 * The traveller is "uncommitted" (branch = null) while on a trunk edge that
 * is shared by multiple services, and commits to a specific branch only when
 * they take a branch-exclusive edge.
 *
 * Returns all equally-weighted optimal routes. Throws if no path exists.
 */
export function findRoute(
  fromId: string,
  toId: string,
  g: TubeGraph = graph
): RouteHint[] {
  if (fromId === toId) {
    return [{ segments: [], totalStops: 0 }];
  }

  if (!g.adjacency[fromId]) {
    throw new Error(`Unknown station: ${fromId}`);
  }
  if (!g.adjacency[toId]) {
    throw new Error(`Unknown station: ${toId}`);
  }

  // Track best cost and all optimal parents for each (station, line, branch) state
  const best = new Map<string, number>();
  const parents = new Map<string, string[]>();

  const startKey = stateKey(fromId, null, null);
  const queue = new MinHeap();
  queue.push({ stationId: fromId, line: null, branch: null, cost: 0 });
  best.set(startKey, 0);
  parents.set(startKey, []);

  let bestTargetCost = Infinity;

  while (queue.size > 0) {
    const current = queue.pop();

    const key = stateKey(current.stationId, current.line, current.branch);

    // Once we've exceeded the best target cost, we're done
    if (current.cost > bestTargetCost) break;

    // Skip if we've already settled a better path to this state
    if (current.cost > (best.get(key) ?? Infinity)) continue;

    // If this is the target, record its cost but don't expand further
    if (current.stationId === toId) {
      bestTargetCost = current.cost;
      continue;
    }

    for (const edge of g.adjacency[current.stationId] ?? []) {
      const edgeBranches = edge.branches;
      if (!edgeBranches || edgeBranches.length === 0) {
        throw new Error(
          `Edge ${current.stationId} -> ${edge.to} (${edge.line}) has no branches — regenerate tube-graph.json`
        );
      }

      const sameLine = current.line === edge.line;

      // Determine penalty and which branches to explore.
      // Unlike the previous uncommitted model, we ALWAYS commit to a
      // specific branch. On multi-branch edges, we explore a state for
      // each branch — the Dijkstra naturally prunes suboptimal ones.
      let penalty: number;
      let branchesToExplore: string[];

      if (current.line === null) {
        // Fresh start — explore each branch on this edge.
        penalty = 0;
        branchesToExplore = edgeBranches;
      } else if (!sameLine) {
        // Full line change.
        penalty = LINE_CHANGE_PENALTY;
        branchesToExplore = edgeBranches;
      } else if (current.branch !== null && edgeBranches.includes(current.branch)) {
        // Same line, same branch — continuing the same train.
        penalty = 0;
        branchesToExplore = [current.branch];
      } else if (current.branch !== null) {
        // Same line but the current branch doesn't cover this edge:
        // branch change penalty, explore each new branch.
        penalty = BRANCH_CHANGE_PENALTY;
        branchesToExplore = edgeBranches;
      } else {
        // current.branch is null (shouldn't happen with new model, but
        // handle gracefully for the start state).
        penalty = 0;
        branchesToExplore = edgeBranches;
      }

      const nextCost = current.cost + 1 + penalty;
      if (nextCost > bestTargetCost) continue;

      for (const nextBranch of branchesToExplore) {
        const nextKey = stateKey(edge.to, edge.line, nextBranch);
        const prevBest = best.get(nextKey) ?? Infinity;

        if (nextCost < prevBest) {
          best.set(nextKey, nextCost);
          parents.set(nextKey, [key]);
          queue.push({
            stationId: edge.to,
            line: edge.line,
            branch: nextBranch,
            cost: nextCost,
          });
        } else if (nextCost === prevBest) {
          parents.get(nextKey)!.push(key);
        }
      }
    }
  }

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

  // Reconstruct all paths by walking backwards through parents.
  // Each path element records the line and branch used to *enter* this station.
  interface Step {
    line: string;
    branch: string | null;
    stationId: string;
  }
  const allPaths: Step[][] = [];

  function reconstruct(key: string, path: Step[]) {
    const parentList = parents.get(key);
    if (!parentList || parentList.length === 0) {
      allPaths.push([...path].reverse());
      return;
    }
    const { stationId, line, branch } = parseStateKey(key);
    for (const parentKey of parentList) {
      path.push({ line: line!, branch, stationId });
      reconstruct(parentKey, path);
      path.pop();
    }
  }

  for (const targetKey of targetKeys) {
    reconstruct(targetKey, []);
  }

  // Split into segments. A new segment begins when either the line changes
  // or the committed branch changes. A transition from null→concrete (or
  // concrete→null) on the same line is NOT a split, because uncommitted
  // trunk travel is the same train as the branch-committed continuation.
  interface RawSegment {
    line: string;
    branch: string | null;
    stops: number;
    startStationId: string;
    endStationId: string;
    path: string[];
  }
  const rawRoutes: { segments: RawSegment[]; totalStops: number }[] = [];
  const seenRaw = new Set<string>();

  for (const steps of allPaths) {
    const segments: RawSegment[] = [];
    let prevStation = fromId;
    for (const step of steps) {
      const last = segments[segments.length - 1];
      const sameLine = last && last.line === step.line;
      const branchCompatible =
        sameLine &&
        (last!.branch === null ||
          step.branch === null ||
          last!.branch === step.branch);

      if (sameLine && branchCompatible) {
        last!.stops++;
        last!.endStationId = step.stationId;
        last!.path.push(step.stationId);
        if (last!.branch === null && step.branch !== null) {
          last!.branch = step.branch;
        }
      } else {
        segments.push({
          line: step.line,
          branch: step.branch,
          stops: 1,
          startStationId: prevStation,
          endStationId: step.stationId,
          path: [step.stationId],
        });
      }
      prevStation = step.stationId;
    }
    const key = JSON.stringify(segments);
    if (!seenRaw.has(key)) {
      seenRaw.add(key);
      rawRoutes.push({ segments, totalStops: steps.length });
    }
  }

  // Merge routes that only differ in which parallel line or branch was used
  // on a segment. The user doesn't see branch slugs, so routes with the
  // same line/stops/stations but different branches should collapse.
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
    const segments: RouteSegment[] = base.segments.map((s) => {
      const seg: RouteSegment = {
        lines: [s.line],
        stops: s.stops,
        endStationId: s.endStationId,
        path: s.path,
      };
      const towards = deriveTowards(g, s.branch, s.startStationId, s.endStationId);
      if (towards) seg.towards = towards;
      return seg;
    });
    for (let r = 1; r < group.length; r++) {
      for (let i = 0; i < segments.length; i++) {
        const line = group[r].segments[i].line;
        if (!segments[i].lines.includes(line)) {
          segments[i].lines.push(line);
        }
      }
    }
    for (const seg of segments) {
      seg.lines.sort();
    }
    hints.push({ segments, totalStops: base.totalStops });
  }

  // Prefer routes with fewer changes (segments) when total cost is tied
  hints.sort((a, b) => a.segments.length - b.segments.length);

  return hints;
}

/**
 * Parse a branch slug like "northern:edgware-morden-via-charing-cross" and
 * return the human-friendly name of the terminus the traveller is heading
 * toward on this segment. Returns undefined if the branch is unknown or if
 * direction can't be inferred from just the start and end stations.
 */
function deriveTowards(
  g: TubeGraph,
  branch: string | null,
  startStationId: string,
  endStationId: string
): string | undefined {
  if (!branch) return undefined;
  const colon = branch.indexOf(":");
  if (colon < 0) return undefined;
  const rest = branch.slice(colon + 1).replace(/-via-[a-z0-9-]+$/, "");

  const slugs = Object.keys(g.stations);
  let termA: string | null = null;
  let termB: string | null = null;
  if (slugs.includes(rest)) {
    // Single-terminus loop (e.g. Piccadilly T4 loop).
    termA = rest;
    termB = rest;
  } else {
    for (const s of slugs) {
      if (rest.startsWith(s + "-")) {
        const remainder = rest.slice(s.length + 1);
        if (slugs.includes(remainder)) {
          termA = s;
          termB = remainder;
          break;
        }
      }
    }
  }
  if (!termA || !termB) return undefined;

  let target: string | null = null;
  if (termA === termB) {
    target = termA;
  } else if (endStationId === termA) {
    target = termA;
  } else if (endStationId === termB) {
    target = termB;
  } else if (startStationId === termA) {
    target = termB;
  } else if (startStationId === termB) {
    target = termA;
  } else {
    return undefined;
  }
  return g.stations[target]?.name;
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
