"use client";

import { useEffect, useState } from "react";
import type { PhotoAssessment } from "@/lib/db";
import type { Focus } from "@/lib/focus";
import { RectifiedCanvasView } from "./RectifiedCanvasView";

type AuditJson = {
  parsed?: {
    foci?: Focus[];
    foci_count?: number;
    disease_pct?: number;
    reasoning?: string;
  };
  user_override?: {
    foci?: Focus[];
    foci_count?: number;
    disease_pct?: number;
  } | null;
  prompt_version?: string;
  model_id?: string;
};

export function StoredAssessmentReview({
  assessment,
  onClose,
}: {
  assessment: PhotoAssessment;
  onClose?: () => void;
}) {
  const [audit, setAudit] = useState<AuditJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAudit(null);
    setError(null);
    fetch(assessment.audit_json_url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Audit JSON ${r.status}`);
        return (await r.json()) as AuditJson;
      })
      .then((j) => {
        if (!cancelled) setAudit(j);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [assessment.audit_json_url]);

  useEffect(() => {
    if (!enlarged) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEnlarged(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [enlarged]);

  // Prefer the user-edited foci if present, else Claude's parsed list.
  const foci: Focus[] | undefined =
    audit?.user_override?.foci ??
    audit?.parsed?.foci ??
    undefined;

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {assessment.quadrat_label} — {assessment.photo_date}
          </h3>
          <p className="text-xs text-stone-500">
            {assessment.foci_count} foci · {assessment.disease_pct.toFixed(1)}%
            disease · sensitivity {assessment.sensitivity}
            {audit?.user_override ? " · manually edited" : ""}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded border border-stone-300 px-2 py-1 text-xs"
          >
            Close
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Could not load audit data: {error}. The image is still shown below.
        </div>
      )}

      <button
        type="button"
        onClick={() => setEnlarged(true)}
        className="group block w-full cursor-zoom-in text-left"
        title="Click to enlarge"
      >
        <RectifiedCanvasView
          imageUrl={assessment.rectified_image_url}
          foci={foci}
          fociCount={assessment.foci_count}
          diseasePct={assessment.disease_pct}
          maxWidth={520}
          initialMode="foci"
        />
        <span className="mt-1 inline-block text-[11px] text-stone-500 group-hover:text-stone-800">
          Click image to enlarge
        </span>
      </button>

      {audit && (
        <div className="mt-2 text-[11px] text-stone-400">
          Model <code>{audit.model_id ?? "?"}</code> · Prompt{" "}
          <code>{audit.prompt_version ?? "?"}</code>
        </div>
      )}

      {enlarged && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged photo ${assessment.quadrat_label} on ${assessment.photo_date}`}
          onClick={() => setEnlarged(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-full max-w-full overflow-auto rounded-lg bg-white p-4 shadow-2xl"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {assessment.quadrat_label} — {assessment.photo_date}
                </h3>
                <p className="text-xs text-stone-500">
                  {assessment.foci_count} foci ·{" "}
                  {assessment.disease_pct.toFixed(1)}% disease
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnlarged(false)}
                className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
                aria-label="Close enlarged photo"
              >
                Close ✕
              </button>
            </div>
            <RectifiedCanvasView
              imageUrl={assessment.rectified_image_url}
              foci={foci}
              fociCount={assessment.foci_count}
              diseasePct={assessment.disease_pct}
              maxWidth={Math.min(
                typeof window === "undefined" ? 1100 : window.innerWidth - 80,
                1100
              )}
              initialMode="foci"
            />
          </div>
        </div>
      )}
    </div>
  );
}
