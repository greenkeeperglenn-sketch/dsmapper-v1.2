import { NextResponse } from "next/server";
import { runDailyWeather } from "@/app/api/cron/daily-weather/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Module-level rate limit. Repeated refresh clicks within this window
// return 429 instead of triggering another run.
const MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastRunAt = 0;

export async function POST() {
  const now = Date.now();
  const elapsed = now - lastRunAt;
  if (elapsed < MIN_INTERVAL_MS) {
    const remainingSeconds = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Refresh available again in ${remainingSeconds}s`,
        retry_after_seconds: remainingSeconds,
      },
      { status: 429 }
    );
  }
  lastRunAt = now;
  try {
    const result = await runDailyWeather();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
