import "server-only";
import { q } from "./db";
import { TYPE_KEYS, type AppState, type DevType, type DexEntry, type RankRow } from "./types";

type DexRaw = {
  id: number;
  no: number;
  username: string;
  display_name: string;
  building: string;
  type: string;
  x_handle: string;
  farcaster: string;
  telegram: string;
  catchable: boolean;
  caught_at: string | null;
  has_photo: boolean;
  catch_count: number;
  caught_count: number;
};

/** Everything the app needs, in one round of queries. */
export async function buildState(meId: number): Promise<AppState | null> {
  const [dexRows, rankRows] = await Promise.all([
    q<DexRaw>(
      `SELECT u.id, u.username, u.display_name, u.building, u.type, u.x_handle, u.farcaster, u.telegram, u.catchable,
         row_number() OVER (ORDER BY u.id)::int AS no,
         c.created_at AS caught_at, (c.photo IS NOT NULL) AS has_photo,
         (SELECT count(*) FROM catches x WHERE x.catcher_id = u.id)::int AS catch_count,
         (SELECT count(*) FROM catches x WHERE x.caught_id = u.id)::int AS caught_count
       FROM users u
       LEFT JOIN catches c ON c.caught_id = u.id AND c.catcher_id = $1
       WHERE u.face IS NOT NULL OR u.id = $1
       ORDER BY u.id`,
      [meId],
    ),
    q<{ id: number; username: string; display_name: string; type: string; catches: number }>(
      `SELECT u.id, u.username, u.display_name, u.type, count(c.caught_id)::int AS catches
       FROM users u LEFT JOIN catches c ON c.catcher_id = u.id
       WHERE u.face IS NOT NULL
       GROUP BY u.id ORDER BY catches DESC, u.id ASC LIMIT 100`,
    ),
  ]);

  const meRow = dexRows.find((r) => r.id === meId);
  if (!meRow) return null;

  const dex: DexEntry[] = dexRows.map((r) => {
    const isMe = r.id === meId;
    const caught = !!r.caught_at;
    const base: DexEntry = { no: r.no, type: r.type as DevType, isMe, caught };
    if (!isMe && !caught) return base; // unknown entry: number + type only
    return {
      ...base,
      username: r.username,
      displayName: r.display_name,
      building: r.building,
      xHandle: r.x_handle,
      farcaster: r.farcaster,
      telegram: r.telegram,
      caughtAt: r.caught_at ? new Date(r.caught_at).toISOString() : undefined,
      hasPhoto: r.has_photo,
      catchCount: Number(r.catch_count),
      caughtCount: Number(r.caught_count),
    };
  });

  const ranks: RankRow[] = rankRows.map((r) => ({
    username: r.username,
    displayName: r.display_name,
    type: r.type as DevType,
    catches: Number(r.catches),
    isMe: r.id === meId,
  }));
  const myCatches = Number(meRow.catch_count);
  const rank = 1 + ranks.filter((r) => r.catches > myCatches).length;

  return {
    me: {
      no: meRow.no,
      username: meRow.username,
      displayName: meRow.display_name,
      building: meRow.building,
      type: meRow.type as DevType,
      xHandle: meRow.x_handle,
      farcaster: meRow.farcaster,
      telegram: meRow.telegram,
      catchable: meRow.catchable,
      catchCount: myCatches,
      caughtCount: Number(meRow.caught_count),
      rank,
    },
    dex,
    ranks,
  };
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

/** A small JPEG data URL (the catch snapshot). Returns the base64 payload or null. */
export function cleanPhoto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m || m[1].length > 400_000) return null;
  return m[1];
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
  return q<{ id: number; username: string; catchable: boolean; dist: number }>(
    `WITH qv AS (SELECT x, i FROM unnest($1::float8[]) WITH ORDINALITY AS t(x, i))
     SELECT u.id, u.username, u.catchable, sqrt(sum((f.x - qv.x) ^ 2)) AS dist
     FROM users u
     CROSS JOIN LATERAL unnest(u.face) WITH ORDINALITY AS f(x, i)
     JOIN qv ON qv.i = f.i
     WHERE u.face IS NOT NULL
     GROUP BY u.id, u.username, u.catchable
     ORDER BY dist ASC
     LIMIT $2`,
    [descriptor, limit],
  );
}
