/**
 * Fetches all TfL API data needed by build-data.ts and caches it locally.
 *
 * Run this outside the sandbox when you need to refresh the TfL data.
 * The cached files are read by build-data.ts which can run without network.
 *
 * Usage:
 *   npx tsx scripts/fetch-tfl.ts              # graph data only
 *   npx tsx scripts/fetch-tfl.ts --metadata   # also fetch coordinates & boroughs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const TFL_BASE = "https://api.tfl.gov.uk";
const CACHE_DIR = join(import.meta.dirname, "tfl-cache");

async function fetchJson<T>(url: string): Promise<T> {
  console.log(`  GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeCache(filename: string, data: unknown): void {
  const path = join(CACHE_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const withMetadata = args.includes("--metadata");

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(join(CACHE_DIR, "route-sequence"), { recursive: true });
  mkdirSync(join(CACHE_DIR, "routes"), { recursive: true });

  // 1. Fetch line list
  console.log("Fetching line list...");
  const lines = await fetchJson<{ id: string; name: string }[]>(
    `${TFL_BASE}/Line/Mode/tube,elizabeth-line`
  );
  writeCache("lines.json", lines);
  console.log(`  ${lines.length} lines: ${lines.map((l) => l.name).join(", ")}`);

  // 2. For each line, fetch route sequences and through-routes
  for (const line of lines) {
    console.log(`\nFetching ${line.name}...`);

    for (const direction of ["outbound", "inbound"] as const) {
      try {
        const seq = await fetchJson(
          `${TFL_BASE}/Line/${line.id}/Route/Sequence/${direction}`
        );
        writeCache(`route-sequence/${line.id}-${direction}.json`, seq);
      } catch (e) {
        console.warn(`  ⚠ Failed to fetch ${direction} sequence: ${e}`);
      }
      await sleep(200);
    }

    try {
      const routes = await fetchJson(
        `${TFL_BASE}/Line/${line.id}/Route`
      );
      writeCache(`routes/${line.id}.json`, routes);
    } catch (e) {
      console.warn(`  ⚠ Failed to fetch routes: ${e}`);
    }
    await sleep(200);
  }

  // 3. Optionally fetch metadata (coordinates & boroughs)
  if (withMetadata) {
    console.log("\nFetching station coordinates...");
    const stopPoints = await fetchJson(
      `${TFL_BASE}/StopPoint/Mode/tube,elizabeth-line`
    );
    writeCache("stoppoints.json", stopPoints);

    // Borough reverse geocoding from Nominatim (1 req/sec rate limit)
    // This is done here because it's slow and needs network
    console.log("Reverse geocoding boroughs (this takes a few minutes)...");
    const sp = (stopPoints as { stopPoints: { commonName: string; lat: number; lon: number }[] }).stopPoints;
    const boroughs: Record<string, string> = {};
    for (let i = 0; i < sp.length; i++) {
      const { commonName, lat, lon } = sp[i];
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
          { headers: { "User-Agent": "tuble-build-script" } }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            address?: { city_district?: string; borough?: string; city?: string; town?: string; county?: string };
          };
          const a = data.address;
          const raw = a?.city_district ?? a?.borough ?? a?.city ?? a?.town ?? a?.county ?? "Unknown";
          boroughs[commonName] = raw
            .replace(/^London Borough of\s+/i, "")
            .replace(/^Royal Borough of\s+/i, "");
        }
      } catch {
        boroughs[commonName] = "Unknown";
      }
      if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${sp.length}`);
      if (i < sp.length - 1) await sleep(1000);
    }
    writeCache("boroughs.json", boroughs);
  }

  console.log("\n✓ Cache updated in scripts/tfl-cache/");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
