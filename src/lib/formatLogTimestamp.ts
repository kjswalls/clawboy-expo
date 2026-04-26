export type LogTimeFormat = 'local' | 'utc';

const UTC_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
};

const LOCAL_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
};

/** Return `HH:MM:SS` in the requested time zone, or an 8-char spacer for null. */
export function formatLogTime(iso: string | null, mode: LogTimeFormat): string {
  if (!iso) return '        ';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '        ';
    const opts = mode === 'utc' ? UTC_TIME_OPTS : LOCAL_TIME_OPTS;
    // toLocaleTimeString can return "24:00:00" for midnight on some platforms;
    // clamp to "00:00:00" so it stays 8 chars.
    const raw = d.toLocaleTimeString('en-US', opts);
    return raw === '24:00:00' ? '00:00:00' : raw;
  } catch {
    return '        ';
  }
}

const UTC_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
};

const LOCAL_DATE_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/**
 * Return a human label for the day of `iso` — "Today", "Yesterday", or
 * e.g. "Apr 23, 2026" — relative to the selected time zone.
 */
export function formatLogDay(iso: string, mode: LogTimeFormat): string {
  const d = new Date(iso);
  const todayKey = logDayKey(new Date().toISOString(), mode);
  const dayKey = logDayKey(iso, mode);

  if (dayKey === todayKey) return 'Today';

  const [ty, tm, td] = todayKey.split('-').map(Number) as [number, number, number];
  const [dy, dm, dd] = dayKey.split('-').map(Number) as [number, number, number];
  // Check if it's yesterday in the selected TZ by comparing the calendar day
  const todayDate = new Date(Date.UTC(ty, tm - 1, td));
  const logDate  = new Date(Date.UTC(dy, dm - 1, dd));
  if (todayDate.getTime() - logDate.getTime() === 86_400_000) return 'Yesterday';

  const opts = mode === 'utc' ? UTC_DATE_OPTS : LOCAL_DATE_OPTS;
  return d.toLocaleDateString('en-US', opts);
}

/**
 * Return a stable `YYYY-MM-DD` key for the calendar day of `iso` in the
 * requested time zone. Used for change-detection between consecutive log lines.
 */
export function logDayKey(iso: string, mode: LogTimeFormat): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'invalid';

  if (mode === 'utc') {
    // Fast path: slice the date portion directly from the ISO string.
    return iso.slice(0, 10);
  }

  // For local TZ, use toLocaleDateString and reformat as YYYY-MM-DD.
  const parts = d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/'); // "MM/DD/YYYY"

  if (parts.length !== 3) return 'invalid';
  const [mm, dd, yyyy] = parts;
  return `${yyyy}-${mm}-${dd}`;
}
