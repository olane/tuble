import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type { ReactElement } from "react";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = resolve(HERE, "baselines");
const OUT_DIR = resolve(HERE, "_out");

export const UPDATE_BASELINES =
  process.env.UPDATE_VISUAL_BASELINES === "1" ||
  process.env.UPDATE_VISUAL_BASELINES === "true";

/**
 * Render a React SVG element to a rasterised PNG buffer, plus raw RGBA pixels
 * for comparison.
 */
export function rasterize(element: ReactElement): {
  png: Buffer;
  pixels: Buffer;
  width: number;
  height: number;
} {
  const markup = renderToStaticMarkup(element);
  const svg = extractSvg(markup);

  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 }, // 2x for crisper diffs
    font: { loadSystemFonts: true },
    background: "#ffffff",
  });
  const img = resvg.render();
  return {
    png: img.asPng(),
    pixels: img.pixels as Buffer,
    width: img.width,
    height: img.height,
  };
}

/** Pull the first <svg>...</svg> out of a rendered markup string and make it parseable standalone. */
function extractSvg(markup: string): string {
  const match = markup.match(/<svg\b[\s\S]*?<\/svg>/);
  if (!match) throw new Error("No <svg> found in rendered markup");
  let svg = match[0];
  // React renders inline SVG without xmlns (it's implied in HTML). Standalone
  // parsers like resvg require it.
  if (!/\sxmlns\s*=/.test(svg)) {
    svg = svg.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

export interface DiffResult {
  matched: boolean;
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  message?: string;
}

/**
 * Compare rasterised output against a baseline PNG on disk.
 *
 * - If the baseline doesn't exist, writes it and returns matched=true.
 * - If UPDATE_VISUAL_BASELINES=1, overwrites the baseline and returns matched=true.
 * - On mismatch, writes `_out/<name>.actual.png` and `_out/<name>.diff.png`.
 */
export function compareToBaseline(
  name: string,
  rendered: { png: Buffer; pixels: Buffer; width: number; height: number }
): DiffResult {
  ensureDir(BASELINE_DIR);
  const baselinePath = resolve(BASELINE_DIR, `${name}.png`);

  if (!existsSync(baselinePath) || UPDATE_BASELINES) {
    writeFileSync(baselinePath, rendered.png);
    return {
      matched: true,
      diffPixels: 0,
      totalPixels: rendered.width * rendered.height,
      diffRatio: 0,
      message: UPDATE_BASELINES
        ? `Updated baseline ${name}.png`
        : `Wrote new baseline ${name}.png`,
    };
  }

  const baseline = PNG.sync.read(readFileSync(baselinePath));
  if (baseline.width !== rendered.width || baseline.height !== rendered.height) {
    ensureDir(OUT_DIR);
    writeFileSync(resolve(OUT_DIR, `${name}.actual.png`), rendered.png);
    return {
      matched: false,
      diffPixels: rendered.width * rendered.height,
      totalPixels: rendered.width * rendered.height,
      diffRatio: 1,
      message:
        `Dimension mismatch: baseline ${baseline.width}x${baseline.height}, ` +
        `actual ${rendered.width}x${rendered.height}`,
    };
  }

  const diff = new PNG({ width: rendered.width, height: rendered.height });
  const diffPixels = pixelmatch(
    baseline.data,
    rendered.pixels,
    diff.data,
    rendered.width,
    rendered.height,
    { threshold: 0.1 }
  );
  const totalPixels = rendered.width * rendered.height;
  const diffRatio = diffPixels / totalPixels;

  // Fail if more than 0.5% of pixels differ. Tune as needed.
  const matched = diffRatio <= 0.005;

  if (!matched) {
    ensureDir(OUT_DIR);
    writeFileSync(resolve(OUT_DIR, `${name}.actual.png`), rendered.png);
    writeFileSync(resolve(OUT_DIR, `${name}.diff.png`), PNG.sync.write(diff));
  }

  return {
    matched,
    diffPixels,
    totalPixels,
    diffRatio,
    message: matched
      ? undefined
      : `${diffPixels}/${totalPixels} pixels differ (${(diffRatio * 100).toFixed(2)}%). ` +
        `See tests/visual/_out/${name}.{actual,diff}.png`,
  };
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Render a React element to static HTML markup. Used for components that
 * render HTML+CSS rather than inline SVG, where a rasterised PNG compare
 * (via resvg) isn't possible.
 */
export function renderMarkup(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

export interface MarkupDiffResult {
  matched: boolean;
  message?: string;
}

/**
 * Compare rendered markup against a baseline `.html` file on disk.
 *
 * Follows the same semantics as compareToBaseline: writes the baseline the
 * first time (and under UPDATE_VISUAL_BASELINES=1), otherwise does a strict
 * string compare and writes `_out/<name>.actual.html` on mismatch.
 */
export function compareMarkupToBaseline(
  name: string,
  markup: string,
): MarkupDiffResult {
  ensureDir(BASELINE_DIR);
  const baselinePath = resolve(BASELINE_DIR, `${name}.html`);

  if (!existsSync(baselinePath) || UPDATE_BASELINES) {
    writeFileSync(baselinePath, markup);
    return {
      matched: true,
      message: UPDATE_BASELINES
        ? `Updated baseline ${name}.html`
        : `Wrote new baseline ${name}.html`,
    };
  }

  const baseline = readFileSync(baselinePath, "utf8");
  if (baseline === markup) {
    return { matched: true };
  }

  ensureDir(OUT_DIR);
  writeFileSync(resolve(OUT_DIR, `${name}.actual.html`), markup);
  return {
    matched: false,
    message:
      `Markup differs from baseline. ` +
      `See tests/visual/_out/${name}.actual.html`,
  };
}
