"use client";

import type { PhotoAssessment } from "@/lib/airtable";

/**
 * Strip of saved photo thumbnails grouped by site (`quadrat_label`).
 * One row per site, each row scrolls horizontally if it overflows.
 * Clicking a thumbnail fires `onSelect(photoDate)` so the dashboard can
 * open the StoredAssessmentReview overlay it already manages.
 */
export function PhotoStrip({
  photos,
  onSelect,
  selectedDate,
}: {
  photos: PhotoAssessment[];
  onSelect: (date: string) => void;
  selectedDate?: string | null;
}) {
  if (photos.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">
        No photos for this location yet. Upload one from{" "}
        <a href="/assess" className="underline">
          Assess photo
        </a>
        .
      </section>
    );
  }

  // Group by site, oldest first within a row.
  const bySite = new Map<string, PhotoAssessment[]>();
  for (const p of photos) {
    const k = p.quadrat_label || "(unlabelled)";
    const list = bySite.get(k) ?? [];
    list.push(p);
    bySite.set(k, list);
  }
  for (const list of bySite.values()) {
    list.sort((a, b) => a.photo_date.localeCompare(b.photo_date));
  }

  // Stable ordering of rows by site name
  const siteRows = Array.from(bySite.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <header>
        <h2 className="text-sm font-semibold tracking-tight text-stone-900">
          Saved photos ({photos.length})
        </h2>
        <p className="text-xs text-stone-500">
          Grouped by site, oldest on the left. Click a thumbnail to view the
          rectified image with the foci/disease overlay.
        </p>
      </header>
      <div className="space-y-3">
        {siteRows.map(([site, list]) => (
          <SiteRow
            key={site}
            site={site}
            photos={list}
            onSelect={onSelect}
            selectedDate={selectedDate ?? null}
          />
        ))}
      </div>
    </section>
  );
}

function SiteRow({
  site,
  photos,
  onSelect,
  selectedDate,
}: {
  site: string;
  photos: PhotoAssessment[];
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-700">
          {site}
        </span>
        <span className="text-[11px] text-stone-500">{photos.length}</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2">
          {photos.map((p) => (
            <Thumb
              key={p.id}
              photo={p}
              onSelect={() => onSelect(p.photo_date)}
              selected={selectedDate === p.photo_date}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Thumb({
  photo,
  onSelect,
  selected,
}: {
  photo: PhotoAssessment;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${photo.quadrat_label} · ${photo.photo_date} · ${photo.foci_count} foci · ${photo.disease_pct.toFixed(1)}%`}
      className={`group flex shrink-0 flex-col items-stretch gap-1 rounded border-2 bg-white p-1 transition-colors ${
        selected
          ? "border-blue-500 ring-2 ring-blue-200"
          : "border-stone-200 hover:border-stone-400"
      }`}
      style={{ width: 116 }}
    >
      <div
        className="relative overflow-hidden rounded bg-stone-100"
        style={{ width: 108, height: 108 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.rectified_image_url}
          alt={`${photo.quadrat_label} on ${photo.photo_date}`}
          className="h-full w-full object-cover"
          loading="lazy"
          crossOrigin="anonymous"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-gradient-to-b from-black/70 to-transparent px-1.5 py-1 leading-tight"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
        >
          <span className="text-sm font-bold tabular-nums text-white">
            {photo.disease_pct.toFixed(1)}%
          </span>
          <span className="text-sm font-bold tabular-nums text-white">
            {photo.foci_count}
          </span>
        </div>
      </div>
      <span className="text-center text-[11px] font-medium tabular-nums text-stone-700">
        {fmt(photo.photo_date)}
      </span>
    </button>
  );
}

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
