/**
 * Public Storm History API — returns saved daily storm summaries up to 6 months back.
 * No auth required. CORS enabled for roofworksoftexas.com.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CORS = {
  "Access-Control-Allow-Origin": "https://roofworksoftexas.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const months = Math.min(parseInt(searchParams.get("months") || "6", 10), 12);
    const dfwOnly = searchParams.get("dfw") === "1";

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, "");

    const rows = await prisma.storm_history.findMany({
      where: { date: { gte: cutoffStr } },
      orderBy: { date: "desc" },
    });

    const active = rows.filter(r =>
      (!dfwOnly || r.has_dfw_hail || r.has_dfw_torn) &&
      (r.hail_count > 0 || r.torn_count > 0 || r.wind_count > 0)
    );

    // Group by YYYY-MM
    const byMonth: Record<string, typeof active> = {};
    for (const r of active) {
      const key = r.date.slice(0, 4) + "-" + r.date.slice(4, 6);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(r);
    }

    const grouped = Object.entries(byMonth).map(([month, events]) => ({
      month,
      label: new Date(month + "-01T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      events: events.map(e => ({
        date: e.date,
        hail: e.hail_count,
        wind: e.wind_count,
        torn: e.torn_count,
        dfwHail: e.dfw_hail,
        dfwTorn: e.dfw_torn,
        dfwWind: e.dfw_wind,
        maxHail: e.max_hail,
        statesHail: e.states_hail ? JSON.parse(e.states_hail) : [],
        statesTorn: e.states_torn ? JSON.parse(e.states_torn) : [],
        hasDfwHail: e.has_dfw_hail,
        hasDfwTorn: e.has_dfw_torn,
      })),
    }));

    return NextResponse.json({ grouped, total: active.length }, { headers: CORS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
