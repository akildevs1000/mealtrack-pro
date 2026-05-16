/**
 * All timestamps in the DB are stored in UTC; the app displays + reasons in
 * Asia/Dubai. These helpers do every conversion in one place so we don't sprinkle
 * `new Intl.DateTimeFormat(...)` calls across routes.
 */

const TZ = "Asia/Dubai";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function dubaiParts(d: Date) {
  const out: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    // Intl returns "24" for midnight in some locales — normalize to 0.
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/** "HH:MM:SS" in Dubai. */
export function formatDubaiTime(d: Date | string): string {
  const p = dubaiParts(new Date(d));
  return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** "HH:MM" in Dubai — used to compare against camp meal windows. */
export function dubaiHHMM(d: Date = new Date()): string {
  const p = dubaiParts(d);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Dubai hour as 0-23. Used for hourly chart buckets. */
export function dubaiHour(d: Date | string): number {
  return dubaiParts(new Date(d)).hour;
}

/** "YYYY-MM-DD" of the date in Dubai. */
export function dubaiDateKey(d: Date | string): string {
  const p = dubaiParts(new Date(d));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * UTC instant that represents the start of "today" in Dubai. The DB stores
 * MealRecord.date as a Postgres DATE; passing a Date that resolves to the
 * correct calendar day in Dubai keeps the per-day uniqueness right.
 */
export function dubaiStartOfToday(now: Date = new Date()): Date {
  return new Date(`${dubaiDateKey(now)}T00:00:00.000Z`);
}

/** Start-of-day in Dubai for an arbitrary date. */
export function dubaiStartOfDay(d: Date | string): Date {
  return new Date(`${dubaiDateKey(d)}T00:00:00.000Z`);
}

/** 0 (Sun) .. 6 (Sat) for Dubai. */
export function dubaiDayOfWeek(d: Date | string): number {
  // Use the UTC date that represents the Dubai calendar day, then ask for its
  // day-of-week. UTC math is safe here because the constructed Date is exactly
  // YYYY-MM-DDT00:00:00Z.
  return new Date(`${dubaiDateKey(d)}T00:00:00.000Z`).getUTCDay();
}

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
