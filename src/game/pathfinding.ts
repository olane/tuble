import type { TubeGraph, RouteSegment, RouteHint } from "./types";
import graphData from "../data/tube-graph.json";

const graph: TubeGraph = graphData as TubeGraph;

export { graph };

interface BfsNode {
  stationId: string;
  line: string | null; // the line we arrived on
  parent: BfsNode | null;
}

/**
 * BFS shortest path from `fromId` to `toId`.
 * Throws if no path exists. Returns a RouteHint with segments collapsed by line.
 */
export function findRoute(fromId: string, toId: string): RouteHint {
  if (fromId === toId) {
    return { segments: [], totalStops: 0 };
  }

  if (!graph.adjacency[fromId]) {
    throw new Error(`Unknown station: ${fromId}`);
  }
  if (!graph.adjacency[toId]) {
    throw new Error(`Unknown station: ${toId}`);
  }

  const visited = new Set<string>();
  const queue: BfsNode[] = [{ stationId: fromId, line: null, parent: null }];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of graph.adjacency[current.stationId] ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);

      const next: BfsNode = {
        stationId: edge.to,
        line: edge.line,
        parent: current,
      };

      if (edge.to === toId) {
        return buildHint(next);
      }

      queue.push(next);
    }
  }

  throw new Error(`No route found from ${fromId} to ${toId}`);
}

function buildHint(node: BfsNode): RouteHint {
  // Walk back to reconstruct path edges
  const edges: { line: string; stationId: string }[] = [];
  let current: BfsNode | null = node;
  while (current && current.line !== null) {
    edges.push({ line: current.line, stationId: current.stationId });
    current = current.parent;
  }
  edges.reverse();

  // Collapse consecutive edges on the same line into segments
  const segments: RouteSegment[] = [];
  for (const edge of edges) {
    const last = segments[segments.length - 1];
    if (last && last.line === edge.line) {
      last.stops++;
      last.endStationId = edge.stationId;
    } else {
      segments.push({ line: edge.line, stops: 1, endStationId: edge.stationId });
    }
  }

  const totalStops = edges.length;
  return { segments, totalStops };
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
