/**
 * Storm History Backfill + Daily Updater
 * Run once to backfill 6 months, then daily via cron to stay current.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/storm_backfill.ts          (backfill 180 days)
 *   npx ts-node --project tsconfig.json scripts/storm_backfill.ts --days 1 (yesterday only)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DFW_LAT_MIN = 31.5, DFW_LAT_MAX = 34.5;
const DFW_LON_MIN = -99.5, DFW_LON_MAX = -94.0;

function dateToYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function yyyymmddToDate(s: string): Date {
  return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T12:00:00Z`);
}

function parseSpc(text: string, type: "hail" | "wind" | "torn") {
  const lines = text.replace(/\r/g, "").trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).flatMap(line => {
    if (!line.trim()) return [];
    const c = line.split(",");
    if (c.length < 7) return [];
    const lat = parseFloat(c[5]);
    const lon = parseFloat(c[6]);
    if (isNaN(lat) || isNaN(lon)) return [];
    const inDfw = lat >= DFW_LAT_MIN && lat <= DFW_LAT_MAX && lon >= DFW_LON_MIN && lon <= DFW_LON_MAX;
    const state = c[4]?.trim() ?? "";
    if (type === "hail") {
      const size = parseInt(c[1], 10);
      return isNaN(size) ? [] : [{ lat, lon, state, inDfw, size }];
    }
    if (type === "wind") {
      const speed = parseInt(c[1], 10);
      return [{ lat, lon, state, inDfw, speed: isNaN(speed) ? 0 : speed }];
    }
    if (type === "torn") {
      return [{ lat, lon, state, inDfw }];
    }
    return [];
  });
}

async function fetchDay(yyyymmdd: string, type: "hail" | "wind" | "torn") {
  const yy = yyyymmdd.slice(2);
  const url = `https://www.spc.noaa.gov/climo/reports/${yy}_rpts_filtered_${type}.csv`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RoofWorksBackfill/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseSpc(text, type);
  } catch {
    return [];
  }
}

async function processDate(yyyymmdd: string) {
  const [hailEvts, windEvts, tornEvts] = await Promise.all([
    fetchDay(yyyymmdd, "hail"),
    fetchDay(yyyymmdd, "wind"),
    fetchDay(yyyymmdd, "torn"),
  ]);

  if (hailEvts.length === 0 && windEvts.length === 0 && tornEvts.length === 0) {
    return null; // nothing to store
  }

  const dfwHail = hailEvts.filter(e => e.inDfw).length;
  const dfwWind = windEvts.filter(e => e.inDfw).length;
  const dfwTorn = tornEvts.filter(e => e.inDfw).length;
  const maxHail = hailEvts.length > 0 ? Math.max(...hailEvts.map((e: any) => e.size || 0)) : null;

  const statesHail = [...new Set(hailEvts.map(e => e.state).filter(Boolean))];
  const statesTorn = [...new Set(tornEvts.map(e => e.state).filter(Boolean))];

  return prisma.storm_history.upsert({
    where: { date: yyyymmdd },
    create: {
      date: yyyymmdd,
      hail_count: hailEvts.length,
      wind_count: windEvts.length,
      torn_count: tornEvts.length,
      dfw_hail: dfwHail,
      dfw_wind: dfwWind,
      dfw_torn: dfwTorn,
      max_hail: maxHail,
      states_hail: JSON.stringify(statesHail),
      states_torn: JSON.stringify(statesTorn),
      has_dfw_hail: dfwHail > 0,
      has_dfw_torn: dfwTorn > 0,
    },
    update: {
      hail_count: hailEvts.length,
      wind_count: windEvts.length,
      torn_count: tornEvts.length,
      dfw_hail: dfwHail,
      dfw_wind: dfwWind,
      dfw_torn: dfwTorn,
      max_hail: maxHail,
      states_hail: JSON.stringify(statesHail),
      states_torn: JSON.stringify(statesTorn),
      has_dfw_hail: dfwHail > 0,
      has_dfw_torn: dfwTorn > 0,
    },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.includes("--days") ? parseInt(args[args.indexOf("--days") + 1], 10) : 180;
  const days = isNaN(daysArg) ? 180 : daysArg;

  console.log(`Backfilling ${days} days of storm history...`);

  const dates: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(dateToYYYYMMDD(d));
  }

  let saved = 0, skipped = 0;
  for (const date of dates) {
    process.stdout.write(`  ${date}... `);
    const result = await processDate(date);
    if (result) { saved++; console.log("saved"); }
    else { skipped++; console.log("no events"); }
    // Small delay to be polite to SPC servers
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone: ${saved} days saved, ${skipped} empty days skipped.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
