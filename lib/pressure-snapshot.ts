// Single-blob daily snapshot of per-location pressure data.
//
// The Vercel cron at 04:00 UTC writes this once a day after running
// ingestYesterday + computeForecastPressure for each active location.
// All read paths in the app (home page server render, /api/pressure)
// read this snapshot instead of hitting Open-Meteo on every request.

import { list, put } from "@vercel/blob";
import type { PressureScore } from "./airtable";
import type { ForecastPressureRow } from "./forecast-pressure";
import type { RiskBand } from "./smith-kerns";

const SNAPSHOT_PREFIX = "pressure-snapshot/";
const SNAPSHOT_PATHNAME = `${SNAPSHOT_PREFIX}latest.json`;

export type PeakSummary = {
  date: string;
  probability: number;
  risk_band: RiskBand;
};

export type LocationSnapshot = {
  today_score: PressureScore | null;
  peak14: PeakSummary | null;
  forecast: ForecastPressureRow[];
};

export type PressureSnapshot = {
  version: 1;
  generated_at_iso: string;
  locations: Record<string, LocationSnapshot>;
};

export function pickPeak14(forecast: ForecastPressureRow[]): PeakSummary | null {
  let best: ForecastPressureRow | null = null;
  for (const row of forecast) {
    if (!best || row.smith_kerns_probability > best.smith_kerns_probability) {
      best = row;
    }
  }
  return best
    ? {
        date: best.date,
        probability: best.smith_kerns_probability,
        risk_band: best.risk_band,
      }
    : null;
}

export async function writeSnapshot(snapshot: PressureSnapshot): Promise<void> {
  await put(SNAPSHOT_PATHNAME, JSON.stringify(snapshot), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function readSnapshot(): Promise<PressureSnapshot | null> {
  let url: string | null = null;
  try {
    const listing = await list({ prefix: SNAPSHOT_PREFIX });
    const match = listing.blobs.find((b) => b.pathname === SNAPSHOT_PATHNAME);
    url = match?.url ?? null;
  } catch (err) {
    console.warn("readSnapshot: list failed", err);
    return null;
  }
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as PressureSnapshot;
  } catch (err) {
    console.warn("readSnapshot: fetch failed", err);
    return null;
  }
}
