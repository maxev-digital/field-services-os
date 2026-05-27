/**
 * Storm Lead Generator — Per-Point Circle Buffer Engine
 *
 * Sources (in order of availability):
 *   1. SPC storm reports  — ground truth, available next morning, no lag
 *   2. SWDI radar data    — radar-derived, 1-3 day lag, fills gaps between SPC points
 *
 * Each confirmed hail report gets its own circle buffer scaled to hail size.
 * When SWDI posts, its points are merged with SPC to triangulate corridor coverage
 * between two confirmed zones. No convex hull — no false-positive gap fill.
 *
 * Usage:
 *   npx tsx scripts/storm_generate_leads.ts --date 20260425
 *   npx tsx scripts/storm_generate_leads.ts --date 20260425 --min-hail 1.0
 *   npx tsx scripts/storm_generate_leads.ts --date 20260425 --state TX
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MRMS_BASE = "http://127.0.0.1:8001";

// ── Scoring ───────────────────────────────────────────────────────────────────

function priorityScore(
  hailIn: number,
  value: number | null,
  yearBuilt: number | null,
  ownerOccupied: boolean
): number {
  const hail =
    hailIn >= 3.0  ? 40 :
    hailIn >= 2.0  ? 34 :
    hailIn >= 1.5  ? 28 :
    hailIn >= 1.0  ? 20 :
    hailIn >= 0.75 ? 12 : 6;

  const val = Math.min(value || 0, 500_000);
  const valueScore = Math.round((val / 500_000) * 30);

  let age = 10;
  if (yearBuilt) {
    const roofAge = new Date().getFullYear() - yearBuilt;
    age = roofAge >= 20 ? 20 : roofAge >= 15 ? 16 : roofAge >= 10 ? 12 : roofAge >= 5 ? 6 : 2;
  }

  return Math.min(100, hail + valueScore + age + (ownerOccupied ? 10 : 0));
}

// ── Geometry: per-point circle buffers ───────────────────────────────────────

/**
 * Radius in degrees of latitude per hail size.
 * 1° lat ≈ 69 miles.  Tuned to realistic spotter report coverage:
 *   3"+ → 2.5 mi radius,  0.75" → 1.0 mi radius
 * SWDI will later triangulate the corridors between SPC point circles.
 */
function hailRadiusDeg(hailIn: number): number {
  if (hailIn >= 3.0) return 0.036;  // ~2.5 mi
  if (hailIn >= 2.0) return 0.029;  // ~2.0 mi
  if (hailIn >= 1.5) return 0.022;  // ~1.5 mi
  if (hailIn >= 1.0) return 0.017;  // ~1.2 mi
  return 0.014;                      // ~1.0 mi
}

/**
 * Approximate circle as a 32-vertex polygon ring.
 * Longitude stretched by cos(lat) to compensate for meridian convergence.
 */
function buildCircle(lon: number, lat: number, radiusDeg: number, vertices = 32): number[][] {
  const lonScale = 1 / Math.cos((lat * Math.PI) / 180);
  const ring: number[][] = [];
  for (let i = 0; i <= vertices; i++) {
    const angle = (2 * Math.PI * i) / vertices;
    ring.push([
      lon + radiusDeg * lonScale * Math.cos(angle),
      lat + radiusDeg * Math.sin(angle),
    ]);
  }
  return ring;
}

/** GeoJSON MultiPolygon — one circle per hail point at or above minHailIn. */
function buildMultiPolygon(points: HailPoint[], minHailIn: number): object | null {
  const circles = points
    .filter(p => p.hailIn >= minHailIn)
    .map(p => [buildCircle(p.lon, p.lat, hailRadiusDeg(p.hailIn))]);
  if (circles.length === 0) return null;
  return { type: "MultiPolygon", coordinates: circles };
}

// ── Data Sources ──────────────────────────────────────────────────────────────

interface HailPoint {
  lat:      number;
  lon:      number;
  hailIn:   number;
  source:   "spc" | "swdi";
  county?:  string;
  state?:   string;
  location?: string;
}

/** SPC storm reports — ground truth, available next morning */
async function fetchSpcPoints(dateYYYYMMDD: string, stateFilter?: string): Promise<HailPoint[]> {
  const yy  = dateYYYYMMDD.slice(2);
  const url = `https://www.spc.noaa.gov/climo/reports/${yy}_rpts_filtered_hail.csv`;
  console.log(`  SPC: ${url}`);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RoofWorksLeadGen/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { console.error(`  SPC HTTP ${res.status}`); return []; }
    const text = await res.text();

    const points: HailPoint[] = [];
    for (const line of text.split("\n").slice(1)) {
      if (!line.trim()) continue;
      const c = line.split(",");
      if (c.length < 7) continue;

      const lat   = parseFloat(c[5]);
      const lon   = parseFloat(c[6]);
      const size  = parseInt(c[1], 10); // hundredths of inches
      const state = (c[4] || "").trim();

      if (isNaN(lat) || isNaN(lon) || isNaN(size)) continue;
      if (stateFilter && state !== stateFilter) continue;
      if (lat < 28 || lat > 37 || lon < -107 || lon > -93) continue;

      points.push({
        lat, lon,
        hailIn:   size / 100,
        source:   "spc",
        county:   (c[3] || "").trim(),
        state,
        location: (c[2] || "").trim(),
      });
    }

    console.log(`  SPC: ${points.length} reports${stateFilter ? ` in ${stateFilter}` : ""}`);
    return points;
  } catch (e: any) {
    console.error(`  SPC fetch error: ${e.message}`);
    return [];
  }
}

/**
 * SWDI radar hail data — 1-3 day publication lag.
 * When available, fills the corridors between SPC point circles.
 * Returns [] silently if data not yet published — expected for recent dates.
 */
async function fetchSwdiPoints(dateYYYYMMDD: string): Promise<HailPoint[]> {
  const y = dateYYYYMMDD.slice(0, 4);
  const m = dateYYYYMMDD.slice(4, 6);
  const d = dateYYYYMMDD.slice(6, 8);
  const base    = new Date(`${y}-${m}-${d}T12:00:00Z`);
  const endDate = new Date(base.getTime() + 48 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, "");
  const cutoff  = new Date(base.getTime() + 36 * 60 * 60 * 1000).toISOString();

  const LON_MIN = -99.5, LAT_MIN = 31.5, LON_MAX = -94.0, LAT_MAX = 34.5;
  const url = `https://www.ncei.noaa.gov/swdiws/csv/nx3hail/${dateYYYYMMDD}:${endDate}?bbox=${LON_MIN},${LAT_MIN},${LON_MAX},${LAT_MAX}&limit=5000`;
  console.log(`  SWDI: ${url}`);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RoofWorksLeadGen/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.log(`  SWDI: HTTP ${res.status} — not yet published`); return []; }
    const text = await res.text();

    const points: HailPoint[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim() || line.startsWith("ZTIME") || line.startsWith("#") ||
          line.startsWith("count") || line.startsWith("error") || line.startsWith("summary")) continue;
      const c = line.split(",");
      if (c.length < 8) continue;
      const ztime = (c[0] || "").trim();
      if (!ztime.match(/^\d{4}-\d{2}-\d{2}T/)) continue;
      if (ztime > cutoff) continue;

      const lat     = parseFloat(c[6]);
      const lon     = parseFloat(c[7]);
      const prob    = parseInt(c[3], 10);
      const maxSize = parseFloat(c[5]); // inches

      if (isNaN(lat) || isNaN(lon) || isNaN(maxSize)) continue;
      if (prob < 50) continue; // skip low-confidence radar returns
      if (lat < 28 || lat > 37 || lon < -107 || lon > -93) continue;

      points.push({ lat, lon, hailIn: maxSize, source: "swdi" });
    }

    if (points.length > 0) {
      console.log(`  SWDI: ${points.length} radar cells — will fill corridors between SPC circles`);
    } else {
      console.log(`  SWDI: 0 cells — not yet published, running SPC-only`);
    }
    return points;
  } catch (e: any) {
    console.log(`  SWDI: unavailable (${e.message}) — SPC only`);
    return [];
  }
}

/**
 * Merge SPC + SWDI points.
 * Grid-dedupe at 0.01° (~0.7 mi) — SPC ground truth wins ties.
 */
function mergeHailPoints(spc: HailPoint[], swdi: HailPoint[]): HailPoint[] {
  if (swdi.length === 0) return spc;

  const merged = new Map<string, HailPoint>();
  const key = (p: HailPoint) =>
    `${Math.round(p.lat / 0.01) * 0.01},${Math.round(p.lon / 0.01) * 0.01}`;

  for (const p of [...spc, ...swdi]) {
    const k  = key(p);
    const ex = merged.get(k);
    if (!ex || p.hailIn > ex.hailIn || (p.hailIn === ex.hailIn && p.source === "spc")) {
      merged.set(k, p);
    }
  }
  return Array.from(merged.values());
}

// ── MRMS Property Query ───────────────────────────────────────────────────────

async function getPropertiesInGeometry(geometry: object): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      exclude_rentals:  "false",
      exclude_existing: "false",
      limit:  "5000",
      offset: "0",
    });
    const res = await fetch(`${MRMS_BASE}/properties?${params}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(geometry),
      signal:  AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.error(`    /properties HTTP ${res.status}: ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    return data.properties || [];
  } catch (e: any) {
    console.error(`    /properties error: ${e.message}`);
    return [];
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

const HAIL_TIERS = [
  { min: 3.0,  label: '3"+ Catastrophic'  },
  { min: 2.0,  label: '2"+ Major'         },
  { min: 1.5,  label: '1.5"+ Significant' },
  { min: 1.0,  label: '1"+ Damaging'      },
  { min: 0.75, label: '0.75"+ Moderate'   },
];

async function runForDate(date: string, minHail: number, stateFilter?: string) {
  const stormDateStr = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Storm Date: ${stormDateStr}`);
  console.log(`${"═".repeat(60)}`);

  // Fetch both sources in parallel — SWDI silently returns [] if not yet published
  const [spcPts, swdiPts] = await Promise.all([
    fetchSpcPoints(date, stateFilter),
    fetchSwdiPoints(date),
  ]);

  if (spcPts.length === 0 && swdiPts.length === 0) {
    console.log("  No hail data from either source. Skipping.");
    return { created: 0 };
  }

  const allPts    = mergeHailPoints(spcPts, swdiPts);
  const maxHail   = Math.max(...allPts.map(p => p.hailIn));
  const spcCount  = allPts.filter(p => p.source === "spc").length;
  const swdiCount = allPts.filter(p => p.source === "swdi").length;
  console.log(`\n  Points: ${allPts.length} total (${spcCount} SPC + ${swdiCount} SWDI) | Max: ${maxHail.toFixed(2)}"`);

  // Build per-tier MultiPolygons — one circle per confirmed point, no gap-fill
  const tiers: { thresholdIn: number; label: string; geometry: object }[] = [];

  for (const tier of HAIL_TIERS) {
    if (tier.min < minHail) continue;
    const tierPts = allPts.filter(p => p.hailIn >= tier.min);
    if (tierPts.length === 0) continue;

    const geo = buildMultiPolygon(tierPts, tier.min);
    if (!geo) continue;

    tiers.push({ thresholdIn: tier.min, label: tier.label, geometry: geo });
    const s = tierPts.filter(p => p.source === "spc").length;
    const w = tierPts.filter(p => p.source === "swdi").length;
    console.log(`  [${tier.label}]: ${tierPts.length} circles  (${s} SPC + ${w} SWDI)`);
  }

  if (tiers.length === 0) {
    console.log("  No tiers at or above minimum threshold.");
    return { created: 0 };
  }

  // Query parcels — highest hail tier wins per parcel
  const propertyMap = new Map<number, { prop: any; hailIn: number }>();

  for (const tier of tiers) {
    console.log(`\n  Querying [${tier.label}]...`);
    const props = await getPropertiesInGeometry(tier.geometry);
    console.log(`    → ${props.length} parcels`);
    for (const prop of props) {
      const ex = propertyMap.get(prop.id);
      if (!ex || tier.thresholdIn > ex.hailIn) {
        propertyMap.set(prop.id, { prop, hailIn: tier.thresholdIn });
      }
    }
  }

  console.log(`\n  Unique parcels: ${propertyMap.size}`);
  if (propertyMap.size === 0) {
    console.log("  No parcels found in any hit zone.");
    return { created: 0 };
  }

  // De-dupe against existing DB records
  const existingSet = new Set(
    (await prisma.storm_prospects.findMany({
      where:  { storm_date: stormDateStr },
      select: { address: true },
    })).map(p => p.address.toLowerCase().trim())
  );
  console.log(`  Already in DB: ${existingSet.size}`);

  // Score and build insert batch
  const toCreate = Array.from(propertyMap.values())
    .filter(({ prop }) => !existingSet.has((prop.address || "").toLowerCase().trim()))
    .map(({ prop, hailIn }) => {
      const ownerOccupied = !prop.isLikelyRental;
      const score = priorityScore(hailIn, prop.value, prop.yearBuilt, ownerOccupied);
      return {
        name:           prop.owner    || null,
        address:        prop.address  || "",
        city:           prop.city     || "Dallas",
        zip:            prop.zip      || null,
        county:         prop.county   || null,
        damage_type:    "hail",
        source:         `storm_${stormDateStr}`,
        lat:            prop.lat      ?? null,
        lon:            prop.lon      ?? null,
        hail_size_in:   hailIn,
        priority_score: score,
        home_value:     prop.value    ?? null,
        year_built:     prop.yearBuilt ?? null,
        storm_date:     stormDateStr,
        parcel_id:      prop.id       ?? null,
        notes: [
          `${stormDateStr} hail | ${hailIn}"`,
          prop.yearBuilt ? `Built: ${prop.yearBuilt}` : null,
          prop.value     ? `Value: $${Math.round(prop.value).toLocaleString()}` : null,
          ownerOccupied  ? "Owner-occupied" : "Likely rental",
        ].filter(Boolean).join(" | "),
      };
    });

  if (toCreate.length === 0) {
    console.log("  All parcels already imported.");
    return { created: 0 };
  }

  // Score distribution summary
  const tierCounts: Record<string, number>   = {};
  const scoreBuckets: Record<string, number> = { "80-100": 0, "60-79": 0, "40-59": 0, "<40": 0 };
  for (const p of toCreate) {
    const t = p.hail_size_in >= 3.0 ? '3"+' : p.hail_size_in >= 2.0 ? '2"+' :
              p.hail_size_in >= 1.5 ? '1.5"+' : p.hail_size_in >= 1.0 ? '1"+' : '0.75"+';
    tierCounts[t] = (tierCounts[t] || 0) + 1;
    const s = p.priority_score;
    if (s >= 80) scoreBuckets["80-100"]++;
    else if (s >= 60) scoreBuckets["60-79"]++;
    else if (s >= 40) scoreBuckets["40-59"]++;
    else scoreBuckets["<40"]++;
  }
  console.log(`\n  To insert: ${toCreate.length}`);
  console.log("  Hail tiers:", JSON.stringify(tierCounts));
  console.log("  Scores:    ", JSON.stringify(scoreBuckets));

  // Batch insert
  let created = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const result = await prisma.storm_prospects.createMany({
      data:           toCreate.slice(i, i + 500) as any,
      skipDuplicates: true,
    });
    created += result.count;
    process.stdout.write(`\r  Inserting... ${created}/${toCreate.length}`);
  }

  const scores = toCreate.map(p => p.priority_score);
  const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  console.log(`\n  ✓ Inserted: ${created} | Avg score: ${avg} | Max: ${Math.max(...scores)}`);
  return { created };
}

async function main() {
  const args       = process.argv.slice(2);
  const dateArg    = args.find(a => a.startsWith("--date"))?.split("=")[1]
    ?? (args.indexOf("--date")     >= 0 ? args[args.indexOf("--date")     + 1] : null);
  const minHailArg = args.find(a => a.startsWith("--min-hail"))?.split("=")[1]
    ?? (args.indexOf("--min-hail") >= 0 ? args[args.indexOf("--min-hail") + 1] : null);
  const stateArg   = args.find(a => a.startsWith("--state"))?.split("=")[1]
    ?? (args.indexOf("--state")    >= 0 ? args[args.indexOf("--state")    + 1] : null);

  const minHail = parseFloat(minHailArg || "0.75");
  const dates   = dateArg ? [dateArg] : ["20260425", "20260424"];

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║       Roof Works — Storm Lead Generator (Circle)         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Dates: ${dates.join(", ")} | Min hail: ${minHail}" | State: ${stateArg || "TX"}`);
  console.log("  Engine: per-point circle buffers (SPC primary + SWDI when available)");

  let totalCreated = 0;
  for (const date of dates) {
    const { created } = await runForDate(date, minHail, stateArg || "TX");
    totalCreated += created;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  TOTAL NEW PROSPECTS: ${totalCreated}`);
  console.log(`${"═".repeat(60)}`);
  console.log("\n  When SWDI posts (1-3 days after storm), re-run to fill corridors:");
  console.log(`  npx tsx scripts/storm_generate_leads.ts --date ${dates[0]}\n`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
