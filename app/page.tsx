import {
  listAllPhotos,
  listLocations,
  listPressureForLocation,
  type Location,
  type PressureScore,
} from "@/lib/airtable";
import { addDays, todayUTC } from "@/lib/dates";
import {
  computeForecastPressure,
  type ForecastPressureRow,
} from "@/lib/forecast-pressure";
import {
  pickPeak14,
  readSnapshot,
  type LocationSnapshot,
  type PressureSnapshot,
} from "@/lib/pressure-snapshot";
import type { RiskBand } from "@/lib/smith-kerns";
import { DashboardClient, type LocationStat } from "./DashboardClient";

export const dynamic = "force-dynamic";

function fromSnapshot(entry: LocationSnapshot): LocationStat {
  return {
    today: entry.today_score
      ? {
          date: entry.today_score.date,
          probability: entry.today_score.smith_kerns_probability,
          band: entry.today_score.risk_band,
        }
      : null,
    peak14: entry.peak14
      ? {
          date: entry.peak14.date,
          probability: entry.peak14.probability,
          band: entry.peak14.risk_band,
        }
      : null,
  };
}

// Live fallback. Only runs for locations missing from the snapshot
// (brand-new locations or first deploy before the cron has fired).
async function liveStatForLocation(loc: Location): Promise<LocationStat> {
  const since = addDays(todayUTC(), -7);
  const [actuals, forecast] = await Promise.all([
    listPressureForLocation(loc.id, { sinceDate: since }).catch(
      () => [] as PressureScore[]
    ),
    computeForecastPressure(loc, 14).catch(() => [] as ForecastPressureRow[]),
  ]);
  const latest = actuals[actuals.length - 1] ?? null;
  const peak = pickPeak14(forecast);
  let band: RiskBand | null = null;
  if (latest) band = latest.risk_band;
  return {
    today: latest
      ? {
          date: latest.date,
          probability: latest.smith_kerns_probability,
          band: band ?? latest.risk_band,
        }
      : null,
    peak14: peak
      ? { date: peak.date, probability: peak.probability, band: peak.risk_band }
      : null,
  };
}

export default async function HomePage() {
  let locations: Location[] = [];
  let allPhotos: Awaited<ReturnType<typeof listAllPhotos>> = [];
  let snapshot: PressureSnapshot | null = null;
  let loadError: string | null = null;
  try {
    [locations, allPhotos, snapshot] = await Promise.all([
      listLocations(),
      listAllPhotos(),
      readSnapshot(),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const photoCounts: Record<string, number> = {};
  const lastPhotoDate: Record<string, string> = {};
  for (const p of allPhotos) {
    photoCounts[p.locationId] = (photoCounts[p.locationId] ?? 0) + 1;
    const prev = lastPhotoDate[p.locationId];
    if (!prev || p.photo_date > prev) lastPhotoDate[p.locationId] = p.photo_date;
  }

  const active = locations.filter((l) => l.active);

  // Read each active location's stats from the snapshot. Anything missing
  // (typically: brand-new location added since the last cron) falls back
  // to a live Open-Meteo + Airtable read.
  const locationStats: Record<string, LocationStat> = {};
  const missing: Location[] = [];
  for (const loc of active) {
    const entry = snapshot?.locations[loc.id];
    if (entry) {
      locationStats[loc.id] = fromSnapshot(entry);
    } else {
      missing.push(loc);
    }
  }
  if (missing.length > 0) {
    const fallback = await Promise.all(
      missing.map((l) => liveStatForLocation(l).catch(() => null))
    );
    missing.forEach((l, i) => {
      const s = fallback[i];
      if (s) locationStats[l.id] = s;
    });
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          <div className="font-semibold">Airtable load failed</div>
          <div className="mt-1 break-words font-mono text-xs">{loadError}</div>
          <div className="mt-2 text-xs text-red-700">
            Check that <code>AIRTABLE_API_KEY</code> and{" "}
            <code>AIRTABLE_BASE_ID</code> are set in Vercel for the current
            environment, and that the Personal Access Token has access to
            this base with <code>data.records:read</code>.
          </div>
        </div>
      )}
      <DashboardClient
        locations={locations}
        photoCounts={photoCounts}
        lastPhotoDate={lastPhotoDate}
        locationStats={locationStats}
        snapshotGeneratedAt={snapshot?.generated_at_iso ?? null}
      />
    </div>
  );
}
