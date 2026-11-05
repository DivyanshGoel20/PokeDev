import "server-only";
import { q } from "./db";
import { nearestFaces } from "./users";
import { MATCH, type AskCandidate, type DevType } from "./types";

export type CatchOutcome = {
  result: "caught" | "already" | "nomatch" | "unknown" | "hidden" | "self" | "ask" | "unclear";
  username?: string;
  attempt?: number;
  candidates?: AskCandidate[];
};

/** How the phone got this reading. Numbers only, kept so the rules can be tuned on real throws. */
export type CatchMeta = { selfie?: boolean; canAsk?: boolean; frames?: number | null; facePx?: number | null; frontal?: number | null; readMs?: number | null };

async function logAttempt(
  meId: number,
  row: { bestId?: number | null; secondId?: number | null; d: number; margin: number; result: string },
  meta: CatchMeta,
): Promise<number | null> {
  try {
    const [r] = await q<{ id: string }>(
      `INSERT INTO catch_attempts (catcher_id, best_id, second_id, d, margin, result, frames, face_px, frontal, read_ms, selfie)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        meId,
        row.bestId ?? null,
        row.secondId ?? null,
        Number.isFinite(row.d) ? row.d : null,
        Number.isFinite(row.margin) ? row.margin : null,
        row.result,
        meta.frames ?? null,
        meta.facePx ?? null,
        meta.frontal ?? null,
        meta.readMs ?? null,
        !!meta.selfie,
      ],
    );
    return r ? Number(r.id) : null;
  } catch (e) {
    console.warn("attempt log failed", e); // never let bookkeeping break a catch
    return null;
  }
}

async function candidateCards(meId: number, ids: number[]): Promise<AskCandidate[]> {
  const rows = await q<{
    id: number;
    username: string;
    display_name: string;
    type: DevType;
    type2: DevType | null;
    avatar_at: string | null;
    caught: boolean;
  }>(
    `SELECT u.id, u.username, u.display_name, u.type, u.type2,
            CASE WHEN u.avatar IS NOT NULL THEN u.avatar_at END AS avatar_at,
            EXISTS (SELECT 1 FROM catches c WHERE c.catcher_id = $1 AND c.caught_id = u.id) AS caught
     FROM users u WHERE u.id = ANY($2::int[])`,
    [meId, ids],
  );
  return ids.flatMap((id) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return [];
    return [
      {
        username: r.username,
        displayName: r.display_name,
        type: r.type,
        type2: r.type2 ?? undefined,
        // The sign-up promise: only players who caught you can see your picture.
        avatar: r.caught && r.avatar_at ? `/api/avatar/${r.username}?v=${Date.parse(r.avatar_at)}` : undefined,
        caught: r.caught,
      },
    ];
  });
}

/**
 * Compare a face descriptor against registered players and record a catch on a match.
 * The descriptor itself is never stored: it is compared, then discarded.
 *
 * - With the back camera the catcher is behind the phone, so they are never a candidate:
 *   their own fingerprint is left out entirely (this is what used to cause a false "That's you").
 * - "self" is only possible on the front (selfie) camera, and only on a confident match.
 * - Confident match: caught, automatically.
 * - "ask": close but ambiguous. Nobody is caught; the thrower picks who's in front of them
 *   (see /api/catch/confirm). Players in hide mode are never offered.
 * - "unknown": can't tell a non-player from a poor reading, so the app offers both options
 *   and claims neither.
 * - "nomatch" ("not on PokeDev yet") only when the face is clearly far from every player.
 */
export async function tryCatch(meId: number, descriptor: number[], meta: CatchMeta = {}): Promise<CatchOutcome> {
  const confident = (d: number, margin: number) =>
    (d <= MATCH.STRONG && margin >= MATCH.STRONG_MARGIN) ||
    (d <= MATCH.LOOSE && margin >= MATCH.LOOSE_MARGIN);

  if (meta.selfie) {
    const [b, r] = await nearestFaces(descriptor, 2);
    if (b && b.id === meId && confident(Number(b.dist), r ? Number(r.dist) - Number(b.dist) : Infinity)) return { result: "self" };
  }

  const [best, runnerUp] = await nearestFaces(descriptor, 2, meId);
  const d = best ? Number(best.dist) : Infinity;
  const margin = runnerUp ? Number(runnerUp.dist) - d : Infinity;
  const log = (result: string, offered?: { bestId?: number | null; secondId?: number | null }) =>
    logAttempt(meId, { bestId: offered ? offered.bestId : best?.id, secondId: offered ? offered.secondId : runnerUp?.id, d, margin, result }, meta);
  // Distances only (no face data): lets us tune the thresholds on real catches.
  console.log(JSON.stringify({ ev: "catch", d: Number.isFinite(d) ? +d.toFixed(3) : null, margin: Number.isFinite(margin) ? +margin.toFixed(3) : null }));

  if (!best || d > MATCH.UNSURE) {
    await log("nomatch");
    return { result: "nomatch" };
  }

  if (!confident(d, margin)) {
    if (meta.canAsk && d <= MATCH.ASK) {
      // Offer the closest player, and the runner-up when it's nearly a tie. Never someone in hide mode.
      const offered = [best, ...(runnerUp && margin <= MATCH.ASK_TWO_GAP && Number(runnerUp.dist) <= MATCH.ASK ? [runnerUp] : [])].filter((c) => c.catchable);
      if (offered.length) {
        const candidates = await candidateCards(meId, offered.map((c) => c.id));
        const attempt = await log("ask", { bestId: offered[0].id, secondId: offered[1]?.id ?? null });
        if (attempt && candidates.length) return { result: "ask", attempt, candidates };
      }
    }
    await log("unknown");
    // Older copies of the app (a tab left open) don't know "ask": they keep today's behaviour.
    return { result: !meta.canAsk && d <= 0.45 ? "unclear" : "unknown" };
  }

  if (!best.catchable) {
    await log("hidden");
    return { result: "hidden" };
  }
  const inserted = await q(
    `INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2)
     ON CONFLICT (catcher_id, caught_id) DO NOTHING RETURNING caught_id`,
    [meId, best.id],
  );
  await log(inserted.length ? "caught" : "already");
  return { result: inserted.length ? "caught" : "already", username: best.username };
}

/**
 * The thrower's answer to "is this them?". Only someone the server actually offered on this
 * player's own recent throw can be picked, and each throw can be answered once.
 */
export async function answerAsk(meId: number, attempt: number, username: string | null): Promise<CatchOutcome | { error: string; status: number }> {
  const [a] = await q<{ best_id: number | null; second_id: number | null }>(
    `SELECT best_id, second_id FROM catch_attempts
     WHERE id = $1 AND catcher_id = $2 AND result = 'ask' AND answered_at IS NULL AND created_at > now() - interval '10 minutes'`,
    [attempt, meId],
  );
  if (!a) return { error: "That look has expired. Throw the DevBall again.", status: 409 };

  if (!username) {
    await q("UPDATE catch_attempts SET answered_at = now() WHERE id = $1", [attempt]);
    return { result: "unknown" };
  }
  const [u] = await q<{ id: number; username: string; catchable: boolean }>(
    "SELECT id, username, catchable FROM users WHERE username = $1 AND id = ANY($2::int[])",
    [username, [a.best_id, a.second_id].filter((x): x is number => x != null)],
  );
  if (!u) return { error: "That builder wasn't one of the options. Throw the DevBall again.", status: 400 };

  const claimed = await q(
    "UPDATE catch_attempts SET confirmed_id = $2, answered_at = now() WHERE id = $1 AND answered_at IS NULL RETURNING id",
    [attempt, u.id],
  );
  if (!claimed.length) return { error: "That look has expired. Throw the DevBall again.", status: 409 };
  if (!u.catchable) return { result: "hidden" };

  const inserted = await q(
    `INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2)
     ON CONFLICT (catcher_id, caught_id) DO NOTHING RETURNING caught_id`,
    [meId, u.id],
  );
  return { result: inserted.length ? "caught" : "already", username: u.username };
}
