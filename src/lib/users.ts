import "server-only";
import { q } from "./db";
import { TYPE_KEYS, type DevType, type PublicUser } from "./types";

const SELECT_PUBLIC = `
  SELECT u.id, u.username, u.display_name, u.building, u.type, u.x_handle, u.farcaster, u.telegram,
    (SELECT count(*) FROM catches c WHERE c.caught_id = u.id)::int AS caught_count,
    (SELECT count(*) FROM catches c WHERE c.catcher_id = u.id)::int AS catch_count
  FROM users u`;

type Raw = {
  id: number;
  username: string;
  display_name: string;
  building: string;
  type: string;
  x_handle: string;
  farcaster: string;
  telegram: string;
  caught_count: number;
  catch_count: number;
};

export function toPublic(r: Raw): PublicUser {
  return {
    username: r.username,
    displayName: r.display_name,
    building: r.building,
    type: r.type as DevType,
    xHandle: r.x_handle,
    farcaster: r.farcaster,
    telegram: r.telegram,
    number: r.id,
    caughtCount: Number(r.caught_count),
    catchCount: Number(r.catch_count),
  };
}

export async function publicUserById(id: number) {
  const rows = await q<Raw>(`${SELECT_PUBLIC} WHERE u.id = $1`, [id]);
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function publicUserByUsername(username: string) {
  const rows = await q<Raw>(`${SELECT_PUBLIC} WHERE u.username = $1`, [username.toLowerCase()]);
  return rows[0] ? { id: rows[0].id, user: toPublic(rows[0]) } : null;
}

export async function collection(catcherId: number) {
  const rows = await q<Raw & { caught_at: string }>(
    `SELECT * FROM (${SELECT_PUBLIC}) u2
     JOIN (SELECT caught_id, created_at AS caught_at FROM catches WHERE catcher_id = $1) c
       ON c.caught_id = u2.id
     ORDER BY c.caught_at DESC`,
    [catcherId],
  );
  return rows.map((r) => ({ ...toPublic(r), caughtAt: new Date(r.caught_at).toISOString() }));
}

export async function leaderboard(limit = 50) {
  const rows = await q<Raw>(
    `SELECT * FROM (${SELECT_PUBLIC}) u2 ORDER BY catch_count DESC, caught_count DESC, id ASC LIMIT $1`,
    [limit],
  );
  return rows.map(toPublic);
}

/* ---------- input validation ---------- */

export function cleanText(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export function cleanHandle(v: unknown) {
  let s = cleanText(v, 120);
  s = s.replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|warpcast\.com|farcaster\.xyz|t\.me)\//i, "");
  s = s.replace(/^@/, "").split(/[/?#]/)[0];
  return s.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40);
}

export function cleanType(v: unknown): DevType | null {
  return TYPE_KEYS.includes(v as DevType) ? (v as DevType) : null;
}

export function cleanDescriptor(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== 128) return null;
  const out = v.map(Number);
  return out.every((n) => Number.isFinite(n) && Math.abs(n) < 10) ? out : null;
}

export function profileFields(body: Record<string, unknown>) {
  return {
    displayName: cleanText(body.displayName, 40),
    building: cleanText(body.building, 140),
    type: cleanType(body.type),
    xHandle: cleanHandle(body.xHandle),
    farcaster: cleanHandle(body.farcaster),
    telegram: cleanHandle(body.telegram),
  };
}

/** Nearest registered faces to a descriptor, by euclidean distance. */
export async function nearestFaces(descriptor: number[], limit = 2) {
  return q<{ id: number; catchable: boolean; dist: number }>(
    `WITH qv AS (SELECT x, i FROM unnest($1::float8[]) WITH ORDINALITY AS t(x, i))
     SELECT u.id, u.catchable, sqrt(sum((f.x - qv.x) ^ 2)) AS dist
     FROM users u
     CROSS JOIN LATERAL unnest(u.face) WITH ORDINALITY AS f(x, i)
     JOIN qv ON qv.i = f.i
     WHERE u.face IS NOT NULL
     GROUP BY u.id, u.catchable
     ORDER BY dist ASC
     LIMIT $2`,
    [descriptor, limit],
  );
}
