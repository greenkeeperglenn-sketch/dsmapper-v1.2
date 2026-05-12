import { neon } from "@neondatabase/serverless";
import { bandFor, type RiskBand } from "./smith-kerns";

export { type RiskBand };

export const TABLES = {
  locations: "locations",
  weather: "weather_readings",
  pressure: "pressure_scores",
  photos: "photo_assessments",
} as const;

// ---------- Domain types ---------------------------------------------------

export type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes?: string;
  active: boolean;
  sites: string[];
  logo_url?: string;
};

export type WeatherReading = {
  id: string;
  locationId: string;
  date: string;
  temp_mean_c: number;
  rh_mean_pct: number;
  source: string;
};

export type PressureScore = {
  id: string;
  locationId: string;
  date: string;
  temp_5day_avg_c: number;
  rh_5day_avg_pct: number;
  temp_term: number;
  rh_term: number;
  smith_kerns_probability: number;
  risk_band: RiskBand;
};

export type PhotoAssessment = {
  id: string;
  locationId: string;
  photo_date: string;
  quadrat_label: string;
  rectified_image_url: string;
  audit_json_url: string;
  foci_count: number;
  disease_pct: number;
  sensitivity: number;
  notes?: string;
};

// ---------- Internals ------------------------------------------------------

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");
  return neon(url);
}

function dateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return (v as string) ?? "";
}

// ---------- Row mappers ----------------------------------------------------

function rowToLocation(r: Record<string, unknown>): Location {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "",
    latitude: (r.latitude as number) ?? 0,
    longitude: (r.longitude as number) ?? 0,
    notes: (r.notes as string) || undefined,
    active: (r.active as boolean) ?? false,
    sites: (r.sites as string[]) ?? [],
    logo_url: (r.logo_url as string) || undefined,
  };
}

function rowToWeather(r: Record<string, unknown>): WeatherReading {
  return {
    id: r.id as string,
    locationId: r.location_id as string,
    date: dateStr(r.date),
    temp_mean_c: (r.temp_mean_c as number) ?? 0,
    rh_mean_pct: (r.rh_mean_pct as number) ?? 0,
    source: (r.source as string) ?? "",
  };
}

function rowToPressure(r: Record<string, unknown>): PressureScore {
  const p = (r.smith_kerns_probability as number) ?? 0;
  return {
    id: r.id as string,
    locationId: r.location_id as string,
    date: dateStr(r.date),
    temp_5day_avg_c: (r.temp_5day_avg_c as number) ?? 0,
    rh_5day_avg_pct: (r.rh_5day_avg_pct as number) ?? 0,
    temp_term: (r.temp_term as number) ?? 0,
    rh_term: (r.rh_term as number) ?? 0,
    smith_kerns_probability: p,
    risk_band: ((r.risk_band as string) as RiskBand) || bandFor(p),
  };
}

function rowToPhoto(r: Record<string, unknown>): PhotoAssessment {
  return {
    id: r.id as string,
    locationId: r.location_id as string,
    photo_date: dateStr(r.photo_date),
    quadrat_label: (r.quadrat_label as string) ?? "Q1",
    rectified_image_url: (r.rectified_image_url as string) ?? "",
    audit_json_url: (r.audit_json_url as string) ?? "",
    foci_count: (r.foci_count as number) ?? 0,
    disease_pct: (r.disease_pct as number) ?? 0,
    sensitivity: (r.sensitivity as number) ?? 3,
    notes: (r.notes as string) || undefined,
  };
}

// ---------- Locations ------------------------------------------------------

export async function listLocations(): Promise<Location[]> {
  const db = sql();
  const rows = await db`SELECT * FROM locations ORDER BY name`;
  return rows.map(rowToLocation);
}

export async function listActiveLocations(): Promise<Location[]> {
  const db = sql();
  const rows = await db`SELECT * FROM locations WHERE active = true ORDER BY name`;
  return rows.map(rowToLocation);
}

export async function getLocation(id: string): Promise<Location | null> {
  const db = sql();
  const rows = await db`SELECT * FROM locations WHERE id = ${id}`;
  return rows[0] ? rowToLocation(rows[0]) : null;
}

export async function createLocation(input: {
  name: string;
  latitude: number;
  longitude: number;
  notes?: string;
  active?: boolean;
  sites?: string[];
}): Promise<Location> {
  const db = sql();
  const rows = await db`
    INSERT INTO locations (name, latitude, longitude, notes, active, sites)
    VALUES (
      ${input.name},
      ${input.latitude},
      ${input.longitude},
      ${input.notes ?? null},
      ${input.active ?? true},
      ${input.sites ?? []}
    )
    RETURNING *
  `;
  return rowToLocation(rows[0]);
}

export async function updateLocation(
  id: string,
  patch: Partial<{
    name: string;
    latitude: number;
    longitude: number;
    notes: string;
    active: boolean;
    sites: string[];
    logo_url: string | null;
  }>
): Promise<Location> {
  const current = await getLocation(id);
  if (!current) throw new Error(`Location ${id} not found`);
  const db = sql();
  const rows = await db`
    UPDATE locations SET
      name       = ${patch.name !== undefined ? patch.name : current.name},
      latitude   = ${patch.latitude !== undefined ? patch.latitude : current.latitude},
      longitude  = ${patch.longitude !== undefined ? patch.longitude : current.longitude},
      notes      = ${patch.notes !== undefined ? (patch.notes ?? null) : (current.notes ?? null)},
      active     = ${patch.active !== undefined ? patch.active : current.active},
      sites      = ${patch.sites !== undefined ? patch.sites : current.sites},
      logo_url   = ${patch.logo_url !== undefined ? (patch.logo_url ?? null) : (current.logo_url ?? null)},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return rowToLocation(rows[0]);
}

export async function deleteLocation(id: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM locations WHERE id = ${id}`;
}

// ---------- WeatherReadings ------------------------------------------------

export async function listWeatherForLocation(
  locationId: string,
  opts?: { sinceDate?: string; untilDate?: string }
): Promise<WeatherReading[]> {
  const db = sql();
  const since = opts?.sinceDate;
  const until = opts?.untilDate;

  if (since && until) {
    const rows = await db`
      SELECT * FROM weather_readings
      WHERE location_id = ${locationId} AND date >= ${since}::date AND date <= ${until}::date
      ORDER BY date
    `;
    return rows.map(rowToWeather);
  }
  if (since) {
    const rows = await db`
      SELECT * FROM weather_readings
      WHERE location_id = ${locationId} AND date >= ${since}::date
      ORDER BY date
    `;
    return rows.map(rowToWeather);
  }
  if (until) {
    const rows = await db`
      SELECT * FROM weather_readings
      WHERE location_id = ${locationId} AND date <= ${until}::date
      ORDER BY date
    `;
    return rows.map(rowToWeather);
  }
  const rows = await db`
    SELECT * FROM weather_readings
    WHERE location_id = ${locationId}
    ORDER BY date
  `;
  return rows.map(rowToWeather);
}

export async function findWeatherByLocationDate(
  locationId: string,
  date: string
): Promise<WeatherReading | null> {
  const db = sql();
  const rows = await db`
    SELECT * FROM weather_readings
    WHERE location_id = ${locationId} AND date = ${date}::date
  `;
  return rows[0] ? rowToWeather(rows[0]) : null;
}

export async function upsertWeatherReading(input: {
  locationId: string;
  date: string;
  temp_mean_c: number;
  rh_mean_pct: number;
  source: string;
}): Promise<WeatherReading> {
  const db = sql();
  const rows = await db`
    INSERT INTO weather_readings (location_id, date, temp_mean_c, rh_mean_pct, source)
    VALUES (${input.locationId}, ${input.date}::date, ${input.temp_mean_c}, ${input.rh_mean_pct}, ${input.source})
    ON CONFLICT (location_id, date) DO UPDATE SET
      temp_mean_c = EXCLUDED.temp_mean_c,
      rh_mean_pct = EXCLUDED.rh_mean_pct,
      source      = EXCLUDED.source
    RETURNING *
  `;
  return rowToWeather(rows[0]);
}

// ---------- PressureScores -------------------------------------------------

export async function listPressureForLocation(
  locationId: string,
  opts?: { sinceDate?: string }
): Promise<PressureScore[]> {
  const db = sql();
  const since = opts?.sinceDate;

  if (since) {
    const rows = await db`
      SELECT * FROM pressure_scores
      WHERE location_id = ${locationId} AND date >= ${since}::date
      ORDER BY date
    `;
    return rows.map(rowToPressure);
  }
  const rows = await db`
    SELECT * FROM pressure_scores
    WHERE location_id = ${locationId}
    ORDER BY date
  `;
  return rows.map(rowToPressure);
}

export async function findPressureByLocationDate(
  locationId: string,
  date: string
): Promise<PressureScore | null> {
  const db = sql();
  const rows = await db`
    SELECT * FROM pressure_scores
    WHERE location_id = ${locationId} AND date = ${date}::date
  `;
  return rows[0] ? rowToPressure(rows[0]) : null;
}

export async function upsertPressureScore(input: {
  locationId: string;
  date: string;
  temp_5day_avg_c: number;
  rh_5day_avg_pct: number;
  temp_term: number;
  rh_term: number;
  smith_kerns_probability: number;
  risk_band: RiskBand;
}): Promise<PressureScore> {
  const db = sql();
  const rows = await db`
    INSERT INTO pressure_scores (
      location_id, date, temp_5day_avg_c, rh_5day_avg_pct,
      temp_term, rh_term, smith_kerns_probability, risk_band
    )
    VALUES (
      ${input.locationId}, ${input.date}::date, ${input.temp_5day_avg_c}, ${input.rh_5day_avg_pct},
      ${input.temp_term}, ${input.rh_term}, ${input.smith_kerns_probability}, ${input.risk_band}
    )
    ON CONFLICT (location_id, date) DO UPDATE SET
      temp_5day_avg_c         = EXCLUDED.temp_5day_avg_c,
      rh_5day_avg_pct         = EXCLUDED.rh_5day_avg_pct,
      temp_term               = EXCLUDED.temp_term,
      rh_term                 = EXCLUDED.rh_term,
      smith_kerns_probability = EXCLUDED.smith_kerns_probability,
      risk_band               = EXCLUDED.risk_band
    RETURNING *
  `;
  return rowToPressure(rows[0]);
}

// ---------- PhotoAssessments -----------------------------------------------

export async function listPhotosForLocation(
  locationId: string
): Promise<PhotoAssessment[]> {
  const db = sql();
  const rows = await db`
    SELECT * FROM photo_assessments
    WHERE location_id = ${locationId}
    ORDER BY photo_date
  `;
  return rows.map(rowToPhoto);
}

export async function listAllPhotos(): Promise<PhotoAssessment[]> {
  const db = sql();
  const rows = await db`
    SELECT * FROM photo_assessments
    ORDER BY photo_date
  `;
  return rows.map(rowToPhoto);
}

export async function createPhotoAssessment(input: {
  locationId: string;
  photo_date: string;
  quadrat_label: string;
  rectified_image_url: string;
  audit_json_url: string;
  foci_count: number;
  disease_pct: number;
  sensitivity: number;
  notes?: string;
}): Promise<PhotoAssessment> {
  const db = sql();
  const rows = await db`
    INSERT INTO photo_assessments (
      location_id, photo_date, quadrat_label, rectified_image_url,
      audit_json_url, foci_count, disease_pct, sensitivity, notes
    )
    VALUES (
      ${input.locationId}, ${input.photo_date}::date, ${input.quadrat_label},
      ${input.rectified_image_url}, ${input.audit_json_url},
      ${input.foci_count}, ${input.disease_pct}, ${input.sensitivity},
      ${input.notes ?? null}
    )
    RETURNING *
  `;
  return rowToPhoto(rows[0]);
}

export async function getPhotoAssessment(
  id: string
): Promise<PhotoAssessment | null> {
  const db = sql();
  const rows = await db`SELECT * FROM photo_assessments WHERE id = ${id}`;
  return rows[0] ? rowToPhoto(rows[0]) : null;
}

export async function updatePhotoAssessment(
  id: string,
  patch: Partial<{
    locationId: string;
    quadrat_label: string;
    notes: string;
  }>
): Promise<PhotoAssessment> {
  const current = await getPhotoAssessment(id);
  if (!current) throw new Error(`PhotoAssessment ${id} not found`);
  const db = sql();
  const rows = await db`
    UPDATE photo_assessments SET
      location_id   = ${patch.locationId !== undefined ? patch.locationId : current.locationId},
      quadrat_label = ${patch.quadrat_label !== undefined ? patch.quadrat_label : current.quadrat_label},
      notes         = ${patch.notes !== undefined ? (patch.notes ?? null) : (current.notes ?? null)}
    WHERE id = ${id}
    RETURNING *
  `;
  return rowToPhoto(rows[0]);
}

export async function deletePhotoAssessment(id: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM photo_assessments WHERE id = ${id}`;
}
