import { NextResponse } from "next/server";
import {
  findPressureByLocationDate,
  listActiveLocations,
} from "@/lib/db";
import { yesterdayUTC } from "@/lib/dates";
import { computeForecastPressure } from "@/lib/forecast-pressure";
import {
  pickPeak14,
  writeSnapshot,
  type LocationSnapshot,
  type PressureSnapshot,
} from "@/lib/pressure-snapshot";
import { ingestYesterday } from "@/lib/weather-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export type DailyWeatherResult = {
  generated_at_iso: string;
  summaries: Array<{
    locationId: string;
    locationName: string;
    pressureRowsWritten?: number;
    forecastRowsComputed?: number;
    error?: string;
  }>;
};

/**
 * Run the daily weather job:
 *   1. For every active location, ingest yesterday's actuals + score it.
 *   2. Compute the 14-day forecast.
 *   3. Pack today_score + peak14 + forecast into a single snapshot.
 *   4. Overwrite pressure-snapshot/latest.json in Vercel Blob.
 *
 * The dashboard reads the snapshot, so no Open-Meteo calls happen on
 * request paths.
 */
export async function runDailyWeather(): Promise<DailyWeatherResult> {
  const locations = await listActiveLocations();
  const yesterday = yesterdayUTC();
  const summaries: DailyWeatherResult["summaries"] = [];
  const snapshotLocations: Record<string, LocationSnapshot> = {};

  for (const loc of locations) {
    try {
      const ingest = await ingestYesterday(loc);
      const forecast = await computeForecastPressure(loc, 14).catch((err) => {
        console.warn(`forecast failed for ${loc.id}`, err);
        return [];
      });
      const todayScore = await findPressureByLocationDate(
        loc.id,
        yesterday
      ).catch(() => null);
      snapshotLocations[loc.id] = {
        today_score: todayScore,
        peak14: pickPeak14(forecast),
        forecast,
      };
      summaries.push({
        locationId: loc.id,
        locationName: loc.name,
        pressureRowsWritten: ingest.pressureRowsWritten,
        forecastRowsComputed: forecast.length,
      });
    } catch (err) {
      console.error(`daily-weather failed for ${loc.id}`, err);
      summaries.push({
        locationId: loc.id,
        locationName: loc.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const snapshot: PressureSnapshot = {
    version: 1,
    generated_at_iso: new Date().toISOString(),
    locations: snapshotLocations,
  };

  try {
    await writeSnapshot(snapshot);
  } catch (err) {
    console.error("writeSnapshot failed", err);
    summaries.push({
      locationId: "(snapshot)",
      locationName: "snapshot write",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { generated_at_iso: snapshot.generated_at_iso, summaries };
}

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await runDailyWeather());
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await runDailyWeather());
}
