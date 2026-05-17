import type { Env } from './types';

const RATE_LIMIT_HOUR = 15;
const RATE_LIMIT_DAY = 75;
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
}

interface RateWindow {
  count: number;
  /** Unix timestamp (seconds) when this window expires. */
  expiresAt: number;
}

/**
 * Read (or create) a rate-limit window from KV.
 * Returns a fresh window if none exists or the stored one has expired.
 */
export async function readWindow(env: Env, key: string, windowSeconds: number, now: number): Promise<RateWindow> {
  const raw = await env.FEEDBACK_KV.get(key);
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw) as RateWindow;
      if (typeof parsed.count === 'number' && typeof parsed.expiresAt === 'number' && parsed.expiresAt > now) {
        return parsed;
      }
    } catch {
      // Malformed — reset.
    }
  }
  return { count: 0, expiresAt: now + windowSeconds };
}

/**
 * Constant-time string comparison to avoid timing-based guessing of the
 * dev bypass token. Both inputs are compared char-by-char regardless of
 * whether an early mismatch is found.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function checkRateLimit(env: Env, ip: string): Promise<RateLimitResult> {
  // Two windows: RATE_LIMIT_HOUR/hour and RATE_LIMIT_DAY/day. KV is eventually
  // consistent — fine for a human-driven feedback form. We bump counters even
  // if a downstream step fails; that's an acceptable conservative bias.
  const hourKey = `rl:ip:${ip}:h`;
  const dayKey = `rl:ip:${ip}:d`;

  const now = Math.floor(Date.now() / 1000);

  const [hour, day] = await Promise.all([
    readWindow(env, hourKey, HOUR_SECONDS, now),
    readWindow(env, dayKey, DAY_SECONDS, now),
  ]);

  if (hour.count >= RATE_LIMIT_HOUR) {
    return { ok: false, retryAfter: Math.max(1, hour.expiresAt - now) };
  }
  if (day.count >= RATE_LIMIT_DAY) {
    return { ok: false, retryAfter: Math.max(1, day.expiresAt - now) };
  }

  const nextHour: RateWindow = { count: hour.count + 1, expiresAt: hour.expiresAt };
  const nextDay: RateWindow = { count: day.count + 1, expiresAt: day.expiresAt };

  await Promise.all([
    env.FEEDBACK_KV.put(hourKey, JSON.stringify(nextHour), { expirationTtl: Math.max(1, hour.expiresAt - now) }),
    env.FEEDBACK_KV.put(dayKey, JSON.stringify(nextDay), { expirationTtl: Math.max(1, day.expiresAt - now) }),
  ]);
  return { ok: true, retryAfter: 0 };
}
