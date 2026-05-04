# Dollar Spot Monitor — Public Site

Read-only public-facing dashboard for tracking dollar spot disease pressure
on golf greens. Shows the locations strip, the hero pressure graph, and the
saved photo strip with click-to-view rectified images.

Stack: Next.js 16 (App Router) + Tailwind 4 + TypeScript on Vercel,
Airtable for structured data, Vercel Blob for image storage.

---

## Setup

### 1. Environment

Copy `.env.example` to `.env.local` and fill in:

```
AIRTABLE_API_KEY=...           # Personal Access Token, scopes data.records:read+write on the base
AIRTABLE_BASE_ID=appXXXX...
BLOB_READ_WRITE_TOKEN=...      # auto-injected by Vercel; needed for local dev only
CRON_SECRET=...                # any random string; used to authorise /api/cron/daily-weather
```

### 2. Airtable schema

The site reads from these tables. Field names are case-sensitive and must
match exactly.

#### `Locations`

| Field | Type |
| --- | --- |
| `name` | Single line text |
| `latitude` | Number (decimal) |
| `longitude` | Number (decimal) |
| `notes` | Long text |
| `active` | Checkbox |
| `logo_url` | URL — optional |

#### `WeatherReadings`

| Field | Type |
| --- | --- |
| `location` | Link → Locations |
| `date` | Date (YYYY-MM-DD) |
| `temp_mean_c` | Number |
| `rh_mean_pct` | Number |
| `source` | Single line text |

#### `PressureScores`

| Field | Type |
| --- | --- |
| `location` | Link → Locations |
| `date` | Date |
| `temp_5day_avg_c` | Number |
| `rh_5day_avg_pct` | Number |
| `temp_term` | Number (= 0.1932 × T5) |
| `rh_term` | Number (= 0.0894 × RH5) |
| `smith_kerns_probability` | Number |
| `risk_band` | Single select with options `Low`, `Moderate`, `High` |

#### `PhotoAssessments`

| Field | Type |
| --- | --- |
| `location` | Link → Locations |
| `photo_date` | Date |
| `quadrat_label` | Single line text |
| `rectified_image_url` | URL |
| `audit_json_url` | URL |
| `foci_count` | Number |
| `disease_pct` | Number |
| `sensitivity` | Number |
| `notes` | Long text |

### 3. Run locally

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # vitest unit tests for the Smith-Kerns model
pnpm build        # production build + type check
```

### 4. Deploy

Push to a Vercel project; set the same env vars in the project settings.
The cron in `vercel.json` runs `/api/cron/daily-weather` at 06:00 UTC daily
to keep the weather data current. To trigger it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://your-app.vercel.app/api/cron/daily-weather
```

The dashboard also self-heals on load: if the latest pressure row is older
than yesterday, `/api/pressure` fetches the gap from Open-Meteo, writes it
to Airtable, and recomputes Smith-Kerns before returning.

---

## Architecture

```
app/
  page.tsx                          dashboard (server-rendered locations)
  api/
    cron/daily-weather              authenticated cron entry point
    pressure                        dashboard data feed (auto catch-up)
    photos                          per-location photo list
lib/
  smith-kerns.ts                    pure logistic-regression function
  airtable.ts                       typed REST wrapper
  open-meteo.ts                     historical weather fetcher
  weather-pipeline.ts               compose: fetch → upsert → score
  forecast-pressure.ts              forecast model
  share-card.ts                     copy-as-image for the hero graph
tests/
  smith-kerns.test.ts               13 cases — published values + monotonicity
```

### Smith-Kerns

`logit(p) = -11.4041 + 0.1932 · T5 + 0.0894 · RH5`. T5 in °C, RH5 in %.
Source: Smith DL et al. 2018, PLOS ONE. Risk bands: Low (<0.20),
Moderate (0.20–0.30), High (≥0.30).

Photo assessments are written by a separate internal tool; this site only
reads them.
