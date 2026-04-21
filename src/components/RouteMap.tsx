import type { RouteSegment } from "../game/types";
import linesData from "../data/lines.json";
import metadataData from "../data/station-metadata.json";

const lines = linesData as Record<string, { name: string; colour: string }>;
const meta = metadataData as Record<string, { lat: number; lon: number; borough: string }>;

const HOP_LENGTH = 20;
const MIN_SEGMENT_LENGTH = 60;
const LINE_THICKNESS = 10;
const DLR_GAP_THICKNESS = LINE_THICKNESS / 3;
const NODE_RADIUS = 9;
const TARGET_RADIUS = 12;
const PADDING = 30;
const MAX_WIDTH = 400;

interface Point {
  x: number;
  y: number;
}

function rawGeoAngle(fromId: string, toId: string): number {
  const f = meta[fromId];
  const t = meta[toId];
  if (!f || !t) return 0;
  const dx = t.lon - f.lon;
  const dy = -(t.lat - f.lat);
  return Math.atan2(dy, dx);
}

function geoAngle(fromId: string, toId: string): number {
  const angle = rawGeoAngle(fromId, toId);
  return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
}

/** Snap `raw` to the nearest 45° direction, excluding `avoid` and its 180° opposite. */
function snapAvoidingReversal(raw: number, avoid: number): number {
  const step = Math.PI / 4;
  let best = Math.round(raw / step) * step;
  // Normalise both to [0, 2π) for comparison
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const avoidNorm = norm(avoid);
  const oppositeNorm = norm(avoid + Math.PI);

  const eq = (a: number, b: number) => Math.abs(norm(a) - b) < 0.01;
  if (!eq(best, avoidNorm) && !eq(best, oppositeNorm)) return best;

  // Try the two nearest neighbours
  const cw = best - step;
  const ccw = best + step;
  const diffCw = Math.abs(raw - cw);
  const diffCcw = Math.abs(raw - ccw);
  const sorted = diffCw <= diffCcw ? [cw, ccw] : [ccw, cw];
  for (const candidate of sorted) {
    if (!eq(candidate, avoidNorm) && !eq(candidate, oppositeNorm)) return candidate;
  }
  // Fallback (shouldn't happen with 8 directions and only 2 excluded)
  return best;
}

export function computeRouteGeometry(guessId: string, segments: RouteSegment[]) {
  const allPoints: Point[][] = [];
  let cursor: Point = { x: 0, y: 0 };
  let prevId = guessId;
  let prevEdgeAngle: number | null = null;

  for (const seg of segments) {
    const segPath = seg.path ?? [seg.endStationId];
    const stationIds = [prevId, ...segPath];
    const pts: Point[] = [{ ...cursor }];

    for (let i = 1; i < stationIds.length; i++) {
      let angle = geoAngle(stationIds[i - 1], stationIds[i]);

      // At the first hop leaving an interchange, avoid 180° reversals so
      // branch points render as a visible Y rather than a doubling-back.
      if (i === 1 && prevEdgeAngle !== null) {
        const diff = Math.abs(angle - prevEdgeAngle);
        const isReversal =
          Math.abs(diff - Math.PI) < 0.01 ||
          Math.abs(diff + Math.PI) < 0.01 ||
          Math.abs(diff) < 0.01;
        if (isReversal) {
          // Use the angle to the segment endpoint for a better branch
          // direction — the first hop alone can mislead when the branch
          // station is almost directly behind the interchange.
          const endId = stationIds[stationIds.length - 1];
          const raw = rawGeoAngle(stationIds[0], endId);
          angle = snapAvoidingReversal(raw, prevEdgeAngle);
        }
      }

      const prev = pts[pts.length - 1];
      pts.push({
        x: prev.x + Math.cos(angle) * HOP_LENGTH,
        y: prev.y + Math.sin(angle) * HOP_LENGTH,
      });
    }

    // Stretch short segments so labels and nodes don't overlap
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen > 0 && segLen < MIN_SEGMENT_LENGTH) {
      const scale = MIN_SEGMENT_LENGTH / segLen;
      for (let i = 1; i < pts.length; i++) {
        pts[i] = {
          x: start.x + (pts[i].x - start.x) * scale,
          y: start.y + (pts[i].y - start.y) * scale,
        };
      }
    }

    allPoints.push(pts);
    cursor = pts[pts.length - 1];
    prevId = seg.endStationId;
    if (pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      prevEdgeAngle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }

  const flat = allPoints.flat();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of flat) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const rawW = maxX - minX;
  const rawH = maxY - minY;
  const scale =
    rawW > 0 ? Math.min(1, (MAX_WIDTH - PADDING * 2) / rawW) : 1;

  const scaledPoints = allPoints.map((pts) =>
    pts.map((p) => ({
      x: (p.x - minX) * scale + PADDING,
      y: (p.y - minY) * scale + PADDING,
    }))
  );

  return {
    segmentPoints: scaledPoints,
    width: rawW * scale + PADDING * 2,
    height: rawH * scale + PADDING * 2,
  };
}

function pointsToSvgPath(points: Point[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

/** Walk along a polyline to find the point and local direction at half the total length. */
function polylineMidpoint(pts: Point[]): { point: Point; angle: number } {
  if (pts.length < 2) return { point: pts[0], angle: 0 };

  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    totalLen += Math.hypot(dx, dy);
  }

  let remaining = totalLen / 2;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (remaining <= len || i === pts.length - 1) {
      const t = len > 0 ? remaining / len : 0;
      return {
        point: {
          x: pts[i - 1].x + dx * t,
          y: pts[i - 1].y + dy * t,
        },
        angle: Math.atan2(dy, dx),
      };
    }
    remaining -= len;
  }

  return { point: pts[pts.length - 1], angle: 0 };
}

/** Create a parallel polyline offset perpendicular to the original by `offset` pixels.
 *  Positive offset shifts to the left of the travel direction. */
function offsetPolyline(pts: Point[], offset: number): Point[] {
  if (pts.length < 2 || offset === 0) return pts;

  // Compute unit normals for each edge (left-hand normal: rotate direction 90° CCW)
  const normals: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      normals.push({ x: 0, y: 0 });
    } else {
      normals.push({ x: -dy / len, y: dx / len });
    }
  }
  // Fill zero-length normals from neighbours
  for (let i = 0; i < normals.length; i++) {
    if (normals[i].x === 0 && normals[i].y === 0) {
      const prev = normals.slice(0, i).reverse().find((n) => n.x !== 0 || n.y !== 0);
      const next = normals.slice(i + 1).find((n) => n.x !== 0 || n.y !== 0);
      normals[i] = prev ?? next ?? { x: 1, y: 0 };
    }
  }

  const MITER_LIMIT = 3.0;
  const result: Point[] = [];

  for (let i = 0; i < pts.length; i++) {
    let nx: number, ny: number;

    if (i === 0) {
      nx = normals[0].x;
      ny = normals[0].y;
    } else if (i === pts.length - 1) {
      nx = normals[normals.length - 1].x;
      ny = normals[normals.length - 1].y;
    } else {
      const nPrev = normals[i - 1];
      const nNext = normals[i];
      const mx = nPrev.x + nNext.x;
      const my = nPrev.y + nNext.y;
      const mLen = Math.hypot(mx, my);
      if (mLen < 1e-6) {
        nx = nPrev.x;
        ny = nPrev.y;
      } else {
        const miterX = mx / mLen;
        const miterY = my / mLen;
        const dot = miterX * nPrev.x + miterY * nPrev.y;
        const scale = Math.min(Math.abs(1 / dot), MITER_LIMIT);
        nx = miterX * scale;
        ny = miterY * scale;
      }
    }

    result.push({ x: pts[i].x + nx * offset, y: pts[i].y + ny * offset });
  }

  return result;
}

const STRIPE_GAP = 1;

/** Edge angle, normalised to [0, π). */
function edgeAngle(a: Point, b: Point): number {
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (angle < 0) angle += Math.PI * 2;
  if (angle >= Math.PI) angle -= Math.PI;
  return angle;
}

/** Perpendicular distance from point `p` to the line through `a` and `b`. */
function perpDist(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

/** Check if two 1-D intervals [a1,a2] and [b1,b2] truly overlap (not just touch). */
function intervalsOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  const lo1 = Math.min(a1, a2);
  const hi1 = Math.max(a1, a2);
  const lo2 = Math.min(b1, b2);
  const hi2 = Math.max(b1, b2);
  return lo1 < hi2 && lo2 < hi1;
}

/** Check if two edges visually overlap (parallel, close, and overlapping along their length). */
function edgesOverlap(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const angA = edgeAngle(a1, a2);
  const angB = edgeAngle(b1, b2);
  // Parallel check (angles within ~10°)
  let diff = Math.abs(angA - angB);
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  if (diff > 0.2) return false;

  // Perpendicular distance check — midpoint of edge B to line of edge A.
  // Use half LINE_THICKNESS so we only offset segments that truly sit on
  // top of each other, not ones that merely graze.
  const midB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
  if (perpDist(a1, a2, midB) > LINE_THICKNESS / 2) return false;

  // Overlap along parallel direction — project onto direction of edge A
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const ux = dx / len;
  const uy = dy / len;
  const projA1 = a1.x * ux + a1.y * uy;
  const projA2 = a2.x * ux + a2.y * uy;
  const projB1 = b1.x * ux + b1.y * uy;
  const projB2 = b2.x * ux + b2.y * uy;
  return intervalsOverlap(projA1, projA2, projB1, projB2);
}

/** Detect which segments overlap and compute perpendicular offsets for each.
 *  Every segment keeps full LINE_THICKNESS; overlapping ones are spread apart. */
function computeOverlapOffsets(segmentPoints: Point[][]): number[] {
  const n = segmentPoints.length;
  const adj = Array.from({ length: n }, () => new Set<number>());

  for (let i = 0; i < n; i++) {
    const ptsI = segmentPoints[i];
    for (let j = i + 1; j < n; j++) {
      const ptsJ = segmentPoints[j];
      // Count overlapping edge pairs — require ≥2 to avoid false positives
      // at interchange junctions where segments diverge at 180°
      let overlapCount = 0;
      for (let ei = 1; ei < ptsI.length; ei++) {
        for (let ej = 1; ej < ptsJ.length; ej++) {
          if (edgesOverlap(ptsI[ei - 1], ptsI[ei], ptsJ[ej - 1], ptsJ[ej])) {
            overlapCount++;
          }
        }
      }
      if (overlapCount >= 3) {
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }

  // Build connected components (overlap groups)
  const visited = new Array<boolean>(n).fill(false);
  const groups: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (visited[i] || adj[i].size === 0) continue;
    const group: number[] = [];
    const stack = [i];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited[cur]) continue;
      visited[cur] = true;
      group.push(cur);
      for (const nb of adj[cur]) {
        if (!visited[nb]) stack.push(nb);
      }
    }
    group.sort((a, b) => a - b);
    groups.push(group);
  }

  // Assign offsets — each segment keeps full LINE_THICKNESS, spaced apart
  const offsets = new Array<number>(n).fill(0);
  const stride = LINE_THICKNESS + STRIPE_GAP;

  for (const group of groups) {
    const gn = group.length;
    for (let r = 0; r < gn; r++) {
      offsets[group[r]] = (r - (gn - 1) / 2) * stride;
    }
  }

  return offsets;
}

/** Return "white" or "black" depending on which contrasts better with the given hex colour. */
export function contrastingTextColor(hex: string): string {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.substring(0, 2), 16);
  const g = parseInt(raw.substring(2, 4), 16);
  const b = parseInt(raw.substring(4, 6), 16);
  // Relative luminance (sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000" : "#fff";
}

const LABEL_BOX_SIZE = 16;

export function segmentKey(seg: { endStationId: string; lines: string[]; stops: number }): string {
  return `${[...seg.lines].sort().join(",")}:${seg.stops}:${seg.endStationId}`;
}

interface RouteMapProps {
  guessId: string;
  segments: RouteSegment[];
  revealedKeys: Set<string>;
  showLines: boolean;
  revealMatchedSegments: boolean;
  revealedTargetLines: Set<string>;
}

export function getRevealedSegments(
  guesses: { stationId: string; hint: { segments: RouteSegment[] } }[]
): Set<string> {
  const segGuessCount = new Map<string, Set<number>>();

  for (let gi = 0; gi < guesses.length; gi++) {
    for (const seg of guesses[gi].hint.segments) {
      const key = segmentKey(seg);
      let set = segGuessCount.get(key);
      if (!set) {
        set = new Set();
        segGuessCount.set(key, set);
      }
      set.add(gi);
    }
  }

  const shared = new Set<string>();
  for (const [key, guessIndices] of segGuessCount) {
    if (guessIndices.size >= 2) {
      shared.add(key);
    }
  }
  return shared;
}

export default function RouteMap({
  guessId,
  segments,
  revealedKeys,
  showLines,
  revealMatchedSegments,
  revealedTargetLines,
}: RouteMapProps) {
  const geo = computeRouteGeometry(guessId, segments);
  const offsets = computeOverlapOffsets(geo.segmentPoints);

  return (
    <div className="route-visualizer-wrapper">
      <svg
        viewBox={`0 0 ${geo.width} ${Math.max(geo.height, 50)}`}
        className="route-svg"
        style={{ width: geo.width, maxWidth: "100%" }}
      >
        {segments.map((seg, j) => {
          const segKey = segmentKey(seg);
          const isLastSegment = j === segments.length - 1;
          const revealedByCross = revealMatchedSegments && !isLastSegment && revealedKeys.has(segKey);
          const revealedByGuess = revealMatchedSegments && isLastSegment && seg.lines.some(l => revealedTargetLines.has(l));
          const revealed = showLines || revealedByCross || revealedByGuess;
          const revealedLine = revealedByGuess
            ? seg.lines.find(l => revealedTargetLines.has(l))
            : undefined;
          const lineColor = revealed
            ? lines[revealedLine ?? seg.lines[0]]?.colour ?? "#999"
            : "#D4C5A9";
          const pts = geo.segmentPoints[j];
          const offset = offsets[j];
          let renderPts = pts;
          if (offset !== 0) {
            renderPts = offsetPolyline(pts, offset);
            // Pin endpoints to original positions so lines converge at
            // interchange nodes and don't poke out behind the circles
            renderPts[0] = pts[0];
            renderPts[renderPts.length - 1] = pts[pts.length - 1];
          }
          const d = pointsToSvgPath(renderPts);
          const { point: mid } = polylineMidpoint(renderPts);
          const textColor = contrastingTextColor(lineColor);
          const half = LABEL_BOX_SIZE / 2;

          const isDLR = revealed && seg.lines[0] === "dlr";

          return (
            <g key={j}>
              <path
                d={d}
                fill="none"
                stroke={lineColor}
                strokeWidth={LINE_THICKNESS}
                strokeLinecap="butt"
                strokeLinejoin="round"
              />
              {isDLR && (
                <path
                  d={d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={DLR_GAP_THICKNESS}
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                />
              )}
              <rect
                x={mid.x - half}
                y={mid.y - half}
                width={LABEL_BOX_SIZE}
                height={LABEL_BOX_SIZE}
                rx={2}
                fill={lineColor}
              />
              <text
                x={mid.x}
                y={mid.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="route-stops-text"
                style={{ fill: textColor }}
              >
                {seg.stops}
              </text>
            </g>
          );
        })}

        {/* Start tick */}
        {(() => {
          const pts = geo.segmentPoints[0];
          if (!pts || pts.length < 2) return null;
          const p = pts[0];
          const next = pts[1];
          const angle =
            Math.atan2(next.y - p.y, next.x - p.x) + Math.PI / 2;
          const tickLen = 11;
          return (
            <line
              x1={p.x + Math.cos(angle) * tickLen}
              y1={p.y + Math.sin(angle) * tickLen}
              x2={p.x - Math.cos(angle) * tickLen}
              y2={p.y - Math.sin(angle) * tickLen}
              stroke="#000"
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })()}

        {/* Interchange nodes */}
        {segments.slice(0, -1).map((_, j) => {
          const pts = geo.segmentPoints[j];
          const p = pts[pts.length - 1];
          return (
            <circle
              key={`int-${j}`}
              cx={p.x}
              cy={p.y}
              r={NODE_RADIUS}
              fill="#fff"
              stroke="#000"
              strokeWidth={2.5}
            />
          );
        })}

        {/* Target node */}
        {(() => {
          const lastSeg =
            geo.segmentPoints[geo.segmentPoints.length - 1];
          const p = lastSeg[lastSeg.length - 1];
          return (
            <g>
              <circle
                cx={p.x}
                cy={p.y}
                r={TARGET_RADIUS}
                fill="#fff"
                stroke="#000"
                strokeWidth={2.5}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="route-target-text"
              >
                ?
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
