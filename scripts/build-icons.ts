/**
 * Generate PNG icon variants from public/icon.svg.
 *
 * Run with `npm run build-icons`. Produces:
 *   public/favicon-32.png        (legacy favicon)
 *   public/apple-touch-icon.png  (180x180, iOS home screen)
 *   public/og-image.png          (1200x630, social share card)
 *
 * The outputs are committed so we don't need resvg in CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const publicDir = resolve(repoRoot, "public");

function renderToPng(svg: string, width: number, outPath: string) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(255,255,255,0)",
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
  });
  const data = resvg.render().asPng();
  writeFileSync(outPath, data);
  console.log(`wrote ${outPath} (${data.length} bytes)`);
}

const iconSvg = readFileSync(resolve(publicDir, "icon.svg"), "utf8");
const ogSvg = readFileSync(resolve(publicDir, "og-image.svg"), "utf8");
renderToPng(iconSvg, 32, resolve(publicDir, "favicon-32.png"));
renderToPng(iconSvg, 180, resolve(publicDir, "apple-touch-icon.png"));
renderToPng(ogSvg, 1200, resolve(publicDir, "og-image.png"));
