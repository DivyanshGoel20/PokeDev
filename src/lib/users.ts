import "server-only";
import { q } from "./db";
import { MAX_LINKS, TYPE_KEYS, type AppState, type CaughtBy, type DevType, type DexEntry, type Link, type RankRow } from "./types";

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
  links: string;
  catchable: boolean;
  caught_at: string | null;
  avatar_at: string | null;
  catch_count: number;
  caught_count: number;
};

/** Everything the app needs, in one round of queries. */
export async function buildState(meId: number): Promise<AppState | null> {
  const [dexRows, rankRows, byRows] = await Promise.all([
    q<DexRaw>(
      `SELECT u.id, u.username, u.display_name, u.building, u.type, u.x_handle, u.farcaster, u.telegram, u.links, u.catchable,
         row_number() OVER (ORDER BY u.id)::int AS no,
         c.created_at AS caught_at, CASE WHEN u.avatar IS NOT NULL THEN u.avatar_at END AS avatar_at,
         (SELECT count(*) FROM catches x WHERE x.catcher_id = u.id)::int AS catch_count,
         (SELECT count(*) FROM catches x WHERE x.caught_id = u.id)::int AS caught_count
       FROM users u
       LEFT JOIN catches c ON c.caught_id = u.id AND c.catcher_id = $1
       WHERE u.face IS NOT NULL OR u.id = $1
       ORDER BY u.id`,
      [meId],
    ),
    // Leaderboard: most catches first; ties go to whoever reached that count first
    // (the time of their latest catch). Every player gets a unique position.
    q<{ id: number; username: string; display_name: string; type: string; catches: number; pos: number }>(
      `WITH t AS (
         SELECT u.id, u.username, u.display_name, u.type,
           count(c.caught_id)::int AS catches, max(c.created_at) AS reached_at
         FROM users u LEFT JOIN catches c ON c.catcher_id = u.id
         WHERE u.face IS NOT NULL
         GROUP BY u.id
       ), r AS (
         SELECT t.*, row_number() OVER (ORDER BY catches DESC, reached_at ASC NULLS LAST, id ASC)::int AS pos FROM t
       )
       SELECT id, username, display_name, type, catches, pos FROM r
       WHERE pos <= 100 OR id = $1
       ORDER BY pos`,
      [meId],
    ),
    q<{ id: number; username: string; display_name: string; type: string; at: string; caught_back: boolean }>(
      `SELECT u.id, u.username, u.display_name, u.type, c.created_at AS at,
         EXISTS (SELECT 1 FROM catches b WHERE b.catcher_id = $1 AND b.caught_id = u.id) AS caught_back
       FROM catches c JOIN users u ON u.id = c.catcher_id
       WHERE c.caught_id = $1
       ORDER BY c.created_at DESC LIMIT 50`,
      [meId],
    ),
  ]);

  const meRow = dexRows.find((r) => r.id === meId);
  if (!meRow) return null;

  // Profile pictures are visible to their owner and to players who caught them.
  const avatarOf = (r: { username: string; avatar_at: string | null }) =>
    r.avatar_at ? `/api/avatar/${r.username}?v=${Date.parse(r.avatar_at)}` : undefined;
  const visible = new Map(dexRows.filter((r) => r.id === meId || r.caught_at).map((r) => [r.id, avatarOf(r)]));

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
      links: parseLinks(r.links),
      caughtAt: r.caught_at ? new Date(r.caught_at).toISOString() : undefined,
      avatar: avatarOf(r),
      catchCount: Number(r.catch_count),
      caughtCount: Number(r.caught_count),
    };
  });

  const ranks: RankRow[] = rankRows.filter((r) => Number(r.pos) <= 100).map((r) => ({
    username: r.username,
    displayName: r.display_name,
    type: r.type as DevType,
    catches: Number(r.catches),
    rank: Number(r.pos),
    isMe: r.id === meId,
    avatar: visible.get(r.id),
  }));
  const myCatches = Number(meRow.catch_count);
  const rank = Number(rankRows.find((r) => r.id === meId)?.pos ?? rankRows.length + 1);

  const noById = new Map(dexRows.map((r) => [r.id, r.no]));
  const caughtBy: CaughtBy[] = byRows.map((r) => ({
    displayName: r.display_name,
    username: r.username,
    type: r.type as DevType,
    at: new Date(r.at).toISOString(),
    no: noById.get(r.id) ?? 0,
    caughtBack: !!r.caught_back,
    avatar: visible.get(r.id),
  }));

  return {
    caughtBy,
    me: {
      no: meRow.no,
      username: meRow.username,
      displayName: meRow.display_name,
      building: meRow.building,
      type: meRow.type as DevType,
      xHandle: meRow.x_handle,
      farcaster: meRow.farcaster,
      telegram: meRow.telegram,
      links: parseLinks(meRow.links),
      catchable: meRow.catchable,
      avatar: avatarOf(meRow),
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

/** A small JPEG data URL (profile picture). Returns the base64 payload or null. */
export function cleanPhoto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m || m[1].length > 300_000) return null;
  return m[1];
}

export function parseLinks(raw: string | null | undefined): Link[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Validate extra links: http(s) only, short labels, at most MAX_LINKS. */
export function cleanLinks(v: unknown): Link[] {
  if (!Array.isArray(v)) return [];
  const out: Link[] = [];
  for (const item of v.slice(0, 20)) {
    if (out.length >= MAX_LINKS) break;
    const it = item as { label?: unknown; url?: unknown };
    let url = cleanText(it.url, 200).replace(/\s/g, "");
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) continue;
      const label = cleanText(it.label, 24) || u.hostname.replace(/^www\./, "");
      out.push({ label, url: u.toString() });
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function profileFields(body: Record<string, unknown>) {
  return {
    links: cleanLinks(body.links),
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
