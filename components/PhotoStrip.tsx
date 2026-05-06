"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { PhotoAssessment, PressureScore } from "@/lib/airtable";
import type { Focus } from "@/lib/focus";
import { bandFor } from "@/lib/smith-kerns";
import { bandPalette, neutralPalette } from "@/lib/risk-palette";
import { RectifiedCanvasView } from "./RectifiedCanvasView";

/**
 * Strip of saved photo thumbnails. Default view groups by site
 * (`quadrat_label`), one row per site. Click a site chip to focus on a
 * single site's chronological gallery, with the average Smith-Kerns
 * pressure between consecutive photos shown in the gaps.
 */
export function PhotoStrip({
  photos,
  scores,
  onSelect,
  selectedDate,
}: {
  photos: PhotoAssessment[];
  scores: PressureScore[];
  onSelect: (date: string) => void;
  selectedDate?: string | null;
}) {
  const [focusedSite, setFocusedSite] = useState<string | null>(null);

  const bySite = useMemo(() => {
    const m = new Map<string, PhotoAssessment[]>();
    for (const p of photos) {
      const k = p.quadrat_label || "(unlabelled)";
      const list = m.get(k) ?? [];
      list.push(p);
      m.set(k, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.photo_date.localeCompare(b.photo_date));
    }
    return m;
  }, [photos]);

  const siteRows = useMemo(
    () =>
      Array.from(bySite.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    [bySite]
  );

  // If the focused site disappears (e.g. location switch), drop it.
  useEffect(() => {
    if (focusedSite && !bySite.has(focusedSite)) setFocusedSite(null);
  }, [focusedSite, bySite]);

  if (photos.length === 0) {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-500">
        No photos for this location yet.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-stone-900">
            Saved photos ({photos.length})
          </h2>
          <p className="text-xs text-stone-500">
            {focusedSite
              ? "Chronological gallery — pressure between visits is shown in the gaps."
              : "Click a site to view that site's timeline with pressure between visits."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <SiteChip
            label="All sites"
            count={photos.length}
            active={focusedSite === null}
            onClick={() => setFocusedSite(null)}
          />
          {siteRows.map(([site, list]) => (
            <SiteChip
              key={site}
              label={site}
              count={list.length}
              active={focusedSite === site}
              onClick={() => setFocusedSite(site)}
            />
          ))}
        </div>
      </header>

      {focusedSite ? (
        <SiteGallery
          photos={bySite.get(focusedSite) ?? []}
          scores={scores}
          onSelect={onSelect}
          selectedDate={selectedDate ?? null}
        />
      ) : (
        <div className="space-y-3">
          {siteRows.map(([site, list]) => (
            <SiteRow
              key={site}
              site={site}
              photos={list}
              onSelect={onSelect}
              onFocus={() => setFocusedSite(site)}
              selectedDate={selectedDate ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SiteChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
      }`}
    >
      {label}{" "}
      <span
        className={`tabular-nums ${
          active ? "text-stone-300" : "text-stone-500"
        }`}
      >
        ({count})
      </span>
    </button>
  );
}

function SiteRow({
  site,
  photos,
  onSelect,
  onFocus,
  selectedDate,
}: {
  site: string;
  photos: PhotoAssessment[];
  onSelect: (date: string) => void;
  onFocus: () => void;
  selectedDate: string | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <button
          type="button"
          onClick={onFocus}
          className="text-xs font-semibold uppercase tracking-wide text-stone-700 hover:text-stone-900 hover:underline"
        >
          {site}
        </button>
        <span className="text-[11px] text-stone-500">{photos.length}</span>
        <button
          type="button"
          onClick={onFocus}
          className="ml-auto text-[11px] text-stone-500 hover:text-stone-900 hover:underline"
        >
          View timeline →
        </button>
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

function SiteGallery({
  photos,
  scores,
  onSelect,
  selectedDate,
}: {
  photos: PhotoAssessment[];
  scores: PressureScore[];
  onSelect: (date: string) => void;
  selectedDate: string | null;
}) {
  // photos are sorted asc by date already.
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-stretch gap-3">
        {photos.map((p, i) => (
          <Fragment key={p.id}>
            <GalleryCard
              photo={p}
              onSelect={() => onSelect(p.photo_date)}
              selected={selectedDate === p.photo_date}
            />
            {i < photos.length - 1 && (
              <PressureDelta
                fromDate={p.photo_date}
                toDate={photos[i + 1].photo_date}
                scores={scores}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

type AuditJson = {
  parsed?: { foci?: Focus[] };
  user_override?: { foci?: Focus[] } | null;
};

function GalleryCard({
  photo,
  onSelect,
  selected,
}: {
  photo: PhotoAssessment;
  onSelect: () => void;
  selected: boolean;
}) {
  const [foci, setFoci] = useState<Focus[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(photo.audit_json_url, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AuditJson>) : null))
      .then((j) => {
        if (cancelled || !j) return;
        setFoci(j.user_override?.foci ?? j.parsed?.foci ?? undefined);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.audit_json_url]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex shrink-0 flex-col items-stretch gap-1 rounded-lg border-2 bg-white p-1.5 transition-colors ${
        selected
          ? "border-blue-500 ring-2 ring-blue-200"
          : "border-stone-200 hover:border-stone-400"
      }`}
      style={{ width: 232 }}
      title={`${photo.quadrat_label} · ${photo.photo_date}`}
    >
      <div
        className="relative overflow-hidden rounded bg-stone-100"
        style={{ width: 220, height: 220 }}
      >
        <RectifiedCanvasView
          imageUrl={photo.rectified_image_url}
          foci={foci}
          fociCount={photo.foci_count}
          diseasePct={photo.disease_pct}
          maxWidth={220}
          initialMode="disease"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/75 via-black/40 to-transparent px-2 py-2 leading-tight"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}
        >
          <div className="text-white">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
              Disease
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {photo.disease_pct.toFixed(1)}%
            </div>
          </div>
          <div className="text-right text-white">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
              Foci
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {photo.foci_count}
            </div>
          </div>
        </div>
      </div>
      <div className="text-center text-xs font-medium text-stone-700">
        {fmt(photo.photo_date)}
      </div>
    </button>
  );
}

function PressureDelta({
  fromDate,
  toDate,
  scores,
}: {
  fromDate: string;
  toDate: string;
  scores: PressureScore[];
}) {
  // Days strictly after fromDate up to and including toDate — the days
  // during which any disease change developed.
  const inRange = scores.filter(
    (s) => s.date > fromDate && s.date <= toDate
  );
  const avg =
    inRange.length > 0
      ? inRange.reduce((acc, s) => acc + s.smith_kerns_probability, 0) /
        inRange.length
      : null;
  const days = daysBetween(fromDate, toDate);
  const palette = avg != null ? bandPalette(bandFor(avg)) : neutralPalette();
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center self-stretch rounded-md border px-3 py-2 text-center"
      style={{
        background: palette.bg,
        borderColor: palette.border,
        color: palette.fg,
        minWidth: 92,
      }}
      title={
        avg != null
          ? `Average Smith-Kerns probability across the ${inRange.length} day${
              inRange.length === 1 ? "" : "s"
            } between ${fromDate} and ${toDate}`
          : "No pressure data in this gap"
      }
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide opacity-80">
        Avg pressure
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {avg != null ? `${Math.round(avg * 100)}%` : "—"}
      </div>
      <div className="text-[10px] tabular-nums opacity-80">
        {days} day{days === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
