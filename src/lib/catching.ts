import "server-only";
import { q } from "./db";
import { nearestFaces } from "./users";
import { MATCH_MARGIN, MATCH_THRESHOLD } from "./types";

export type CatchOutcome = { result: "caught" | "already" | "nomatch" | "hidden" | "self" | "unclear"; username?: string };

/**
 * Compare a face descriptor against registered players and record a catch on a match.
 * Nothing about the descriptor is stored: it is compared, then discarded.
 */
export async function tryCatch(meId: number, descriptor: number[]): Promise<CatchOutcome> {
  const [best, runnerUp] = await nearestFaces(descriptor, 2);
  if (!best || Number(best.dist) > MATCH_THRESHOLD) return { result: "nomatch" };
  // Two players look almost equally similar: don't guess.
  if (runnerUp && Number(runnerUp.dist) - Number(best.dist) < MATCH_MARGIN) return { result: "unclear" };
  if (best.id === meId) return { result: "self" };
  if (!best.catchable) return { result: "hidden" };

  const inserted = await q(
    `INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2)
     ON CONFLICT (catcher_id, caught_id) DO NOTHING RETURNING caught_id`,
    [meId, best.id],
  );
  return { result: inserted.length ? "caught" : "already", username: best.username };
}
