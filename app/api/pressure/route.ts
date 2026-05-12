import { NextResponse } from "next/server";
import { getLocation, listPressureForLocation } from "@/lib/db";
import { jsonRoute } from "@/lib/api-helpers";
import { addDays, todayUTC, yesterdayUTC } from "@/lib/dates";
import { computeForecastPressure } from "@/lib/forecast-pressure";
import { readSnapshot } from "@/lib/pressure-snapshot";
import { ingestWeather } from "@/lib/weather-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_FORECAST_DAYS = 14;
const MAX_FORECAST_DAYS = 16;
// Cap auto-catch-up so a long gap doesn't stall the dashboard.
const MAX_AUTO_CATCH_UP_DAYS = 30;
// Don't re-trigger catch-up for the same location more than once every
// 30 minutes. Otherwise a burst of dashboard loads against an out-of-date
// snapshot would spam Open-Meteo with identical writes.
const CATCH_UP_SUPPRESS_MS = 30 * 60 * 1000;
const lastCatchUpAt = new Map<string, number>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId");
  const daysParam = url.searchParams.get("days");
  const forecastParam = url.searchParams.get("forecastDays");
  if (!locationId) {
    return NextResponse.json({ error: "locationId required" }, { status: 400 });
  }
  const days = daysParam ? Math.max(1, Math.min(365, Number(daysParam))) : 30;
  const forecastDays = forecastParam
    ? Math.max(0, Math.min(MAX_FORECAST_DAYS, Number(forecastParam)))
    : DEFAULT_FORECAST_DAYS;
  const since = addDays(todayUTC(), -days);

  return jsonRoute(
    async () => {
      const [loc, snapshot] = await Promise.all([
        getLocation(locationId),
        readSnapshot().catch(() => null),
      ]);
      let actuals = await listPressureForLocation(locationId, {
        sinceDate: since,
      });

      // --- Self-healing catch-up (safety net for missed cron runs) ----
      // If the latest pressure row is older than yesterday, fetch the gap
      // from Open-Meteo and recompute Smith-Kerns. Suppressed for 30 min
      // per location so dashboard refreshes don't hammer the API while a
      // larger gap is being filled.
      const yesterday = yesterdayUTC();
      const latestStored = actuals[actuals.length - 1]?.date;
      let caughtUpDays = 0;
      let catchUpError: string | null = null;
      let catchUpSuppressed = false;

      if (loc && (!latestStored || latestStored < yesterday)) {
        const last = lastCatchUpAt.get(locationId) ?? 0;
        const elapsedMs = Date.now() - last;
        if (elapsedMs < CATCH_UP_SUPPRESS_MS) {
          catchUpSuppressed = true;
        } else {
          const desiredStart = latestStored
            ? addDays(latestStored, 1)
            : addDays(yesterday, -MAX_AUTO_CATCH_UP_DAYS);
          const cap = addDays(yesterday, -MAX_AUTO_CATCH_UP_DAYS);
          const start = desiredStart < cap ? cap : desiredStart;
          if (start <= yesterday) {
            try {
              lastCatchUpAt.set(locationId, Date.now());
              const summary = await ingestWeather(loc, {
                startDate: start,
                endDate: yesterday,
              });
              caughtUpDays = summary.pressureRowsWritten;
              actuals = await listPressureForLocation(locationId, {
                sinceDate: since,
              });
            } catch (e) {
              catchUpError = e instanceof Error ? e.message : String(e);
              console.warn(`pressure catch-up failed for ${locationId}`, e);
            }
          }
        }
      }

      // Forecast: prefer the snapshot slice. Fall back to a live
      // computation only when the snapshot has no entry for this
      // location (brand-new location or pre-cron first deploy).
      let forecast: Awaited<ReturnType<typeof computeForecastPressure>> = [];
      if (forecastDays > 0 && loc) {
        const snapForecast = snapshot?.locations[locationId]?.forecast;
        if (snapForecast && snapForecast.length > 0) {
          forecast = snapForecast.slice(0, forecastDays);
        } else {
          forecast = await computeForecastPressure(loc, forecastDays).catch(
            () => []
          );
        }
      }

      return {
        scores: actuals.map((s) => ({ ...s, is_forecast: false as const })),
        forecast,
        today: todayUTC(),
        latest_actual_date: actuals[actuals.length - 1]?.date ?? null,
        caught_up_days: caughtUpDays,
        catch_up_error: catchUpError,
        catch_up_suppressed: catchUpSuppressed,
        snapshot_generated_at: snapshot?.generated_at_iso ?? null,
        synced_at_iso: new Date().toISOString(),
      };
    },
    { context: `GET /api/pressure?locationId=${locationId}` }
  );
}
