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
renderToPng(iconSvg, 32, resolve(publicDir, "favicon-32.png"));
renderToPng(iconSvg, 180, resolve(publicDir, "apple-touch-icon.png"));

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0098d4"/>
  <g transform="translate(600 280)">
    <circle cx="0" cy="0" r="120" fill="none" stroke="#fff" stroke-width="36"/>
    <rect x="-180" y="-26" width="360" height="52" fill="#fff"/>
  </g>
  <text x="600" y="500" text-anchor="middle" fill="#fff"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-weight="700" font-size="96" letter-spacing="6">TUBLE</text>
  <text x="600" y="560" text-anchor="middle" fill="#cfeefb"
        font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
        font-weight="500" font-size="28" letter-spacing="2">A daily London Underground guessing game</text>
</svg>`;
renderToPng(ogSvg, 1200, resolve(publicDir, "og-image.png"));
