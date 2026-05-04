import { listAllPhotos, listLocations } from "@/lib/airtable";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let locations: Awaited<ReturnType<typeof listLocations>> = [];
  let allPhotos: Awaited<ReturnType<typeof listAllPhotos>> = [];
  let loadError: string | null = null;
  try {
    [locations, allPhotos] = await Promise.all([
      listLocations(),
      listAllPhotos(),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const photoCounts: Record<string, number> = {};
  for (const p of allPhotos) {
    photoCounts[p.locationId] = (photoCounts[p.locationId] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dollar spot pressure
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Smith-Kerns logistic-regression probability based on the trailing
          5-day mean temperature and relative humidity.
        </p>
      </div>
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
      <DashboardClient locations={locations} photoCounts={photoCounts} />
    </div>
  );
}
