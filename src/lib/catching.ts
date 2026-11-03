import "server-only";
import { q } from "./db";
import { nearestFaces } from "./users";
import { MATCH } from "./types";

export type CatchOutcome = { result: "caught" | "already" | "nomatch" | "hidden" | "self" | "unclear"; username?: string };

/**
 * Compare a face descriptor against registered players and record a catch on a match.
 * Nothing about the descriptor is stored: it is compared, then discarded.
 * "nomatch" (shown as "not on PokeDev yet") is only returned when the face is clearly far from
 * every player; borderline cases return "unclear" so a real player is never told they're missing.
 */
export async function tryCatch(meId: number, descriptor: number[]): Promise<CatchOutcome> {
  const [best, runnerUp] = await nearestFaces(descriptor, 2);
  if (!best || Number(best.dist) > MATCH.UNSURE) return { result: "nomatch" };
  const d = Number(best.dist);
  const margin = runnerUp ? Number(runnerUp.dist) - d : Infinity;
  const confident = (d <= MATCH.STRONG && margin >= MATCH.STRONG_MARGIN) || (d <= MATCH.LOOSE && margin >= MATCH.LOOSE_MARGIN);
  if (!confident) return { result: "unclear" };
  if (best.id === meId) return { result: "self" };
  if (!best.catchable) return { result: "hidden" };

  const inserted = await q(
    `INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2)
     ON CONFLICT (catcher_id, caught_id) DO NOTHING RETURNING caught_id`,
    [meId, best.id],
  );
  return { result: inserted.length ? "caught" : "already", username: best.username };
}
