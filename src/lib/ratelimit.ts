import "server-only";
import { NextResponse } from "next/server";
import { q } from "./db";

/**
 * Fixed-window rate limiter stored in Postgres (works across serverless instances).
 * Returns a 429 response when the limit is exceeded, otherwise null.
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<NextResponse | null> {
  const rows = await q<{ hits: number }>(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING hits`,
    [key, windowSec],
  );
  // Occasionally clean up old windows.
  if (Math.random() < 0.02) await q("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
  if (Number(rows[0]?.hits ?? 0) > max) {
    return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  }
  return null;
}

/** Read-only check: is this key already over its limit (without counting a new hit)? */
export async function isLimited(key: string, max: number, windowSec: number): Promise<boolean> {
  const rows = await q<{ hits: number }>(
    "SELECT hits FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)",
    [key, windowSec],
  );
  return Number(rows[0]?.hits ?? 0) >= max;
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
