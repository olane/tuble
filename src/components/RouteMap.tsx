import type { RouteSegment } from "../game/types";
import linesData from "../data/lines.json";
import metadataData from "../data/station-metadata.json";

const lines = linesData as Record<string, { name: string; colour: string }>;
const meta = metadataData as Record<string, { lat: number; lon: number; borough: string }>;

const HOP_LENGTH = 20;
const MIN_SEGMENT_LENGTH = 50;
const LINE_THICKNESS = 10;
const NODE_RADIUS = 9;
const TARGET_RADIUS = 12;
const PADDING = 30;
const MAX_WIDTH = 400;

interface Point {
  x: number;
  y: number;
}

function geoAngle(fromId: string, toId: string): number {
  const f = meta[fromId];
  const t = meta[toId];
  if (!f || !t) return 0;
  const dx = t.lon - f.lon;
  const dy = -(t.lat - f.lat);
  const angle = Math.atan2(dy, dx);
  return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
}

function computeRouteGeometry(guessId: string, segments: RouteSegment[]) {
  const allPoints: Point[][] = [];
  let cursor: Point = { x: 0, y: 0 };
  let prevId = guessId;

  for (const seg of segments) {
    const segPath = seg.path ?? [seg.endStationId];
    const stationIds = [prevId, ...segPath];
    const pts: Point[] = [{ ...cursor }];

    for (let i = 1; i < stationIds.length; i++) {
      const angle = geoAngle(stationIds[i - 1], stationIds[i]);
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
    const segLen = Math.sqrt(dx * dx + dy * dy);
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

function buildSegmentKey(
  fromId: string,
  seg: { endStationId: string; lines: string[] }
): string {
  return `${fromId}->${seg.endStationId}:${[...seg.lines].sort().join(",")}`;
}

interface RouteMapProps {
  guessId: string;
  segments: RouteSegment[];
  sharedLines: string[];
  revealedKeys: Set<string>;
}

export function getRevealedSegments(
  guesses: { stationId: string; hint: { segments: RouteSegment[] } }[]
): Set<string> {
  const keyCounts = new Map<string, number>();
  const duplicates = new Set<string>();

  for (const guess of guesses) {
    let prevId = guess.stationId;
    for (const seg of guess.hint.segments) {
      const key = buildSegmentKey(prevId, seg);
      const count = (keyCounts.get(key) ?? 0) + 1;
      keyCounts.set(key, count);
      if (count >= 2) duplicates.add(key);
      prevId = seg.endStationId;
    }
  }

  return duplicates;
}

export default function RouteMap({
  guessId,
  segments,
  sharedLines,
  revealedKeys,
}: RouteMapProps) {
  const sharedSet = new Set(sharedLines);
  const geo = computeRouteGeometry(guessId, segments);

  return (
    <div className="route-visualizer-wrapper">
      <svg
        width={geo.width}
        height={Math.max(geo.height, 50)}
        className="route-svg"
      >
        {segments.map((seg, j) => {
          const fromId =
            j === 0 ? guessId : segments[j - 1].endStationId;
          const segKey = buildSegmentKey(fromId, seg);
          const revealedByShared = seg.lines.find((l) => sharedSet.has(l));
          const revealedByCross = revealedKeys.has(segKey);
          const lineColor =
            revealedByShared || revealedByCross
              ? lines[seg.lines[0]]?.colour ?? "#999"
              : "#D4C5A9";
          const pts = geo.segmentPoints[j];
          const d = pointsToSvgPath(pts);
          const start = pts[0];
          const end = pts[pts.length - 1];
          const mid = {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
          };
          const segAngle = Math.atan2(
            end.y - start.y,
            end.x - start.x
          );
          // Pick the perpendicular side that points more upward
          const perp1 = segAngle - Math.PI / 2;
          const perp2 = segAngle + Math.PI / 2;
          const perpAngle =
            Math.sin(perp1) < Math.sin(perp2) ? perp1 : perp2;
          const labelOffset = 16;

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
              <text
                x={mid.x + Math.cos(perpAngle) * labelOffset}
                y={mid.y + Math.sin(perpAngle) * labelOffset}
                textAnchor="middle"
                dominantBaseline="central"
                className="route-stops-text"
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
