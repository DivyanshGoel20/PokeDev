import "server-only";
import { q } from "./db";
import { nearestFaces } from "./users";
import { MATCH } from "./types";

export type CatchOutcome = { result: "caught" | "already" | "nomatch" | "hidden" | "self" | "unclear"; username?: string };

/**
 * Compare a face descriptor against registered players and record a catch on a match.
 * Nothing about the descriptor is stored: it is compared, then discarded.
 *
 * - With the back camera the catcher is behind the phone, so they are never a candidate:
 *   their own fingerprint is left out entirely (this is what used to cause a false "That's you").
 * - "self" is only possible on the front (selfie) camera, and only on a confident match.
 * - "nomatch" ("not on PokeDev yet") only when the face is clearly far from every player;
 *   borderline cases return "unclear" so nobody is mis-caught or wrongly told they're missing.
 */
export async function tryCatch(meId: number, descriptor: number[], opts: { selfie?: boolean } = {}): Promise<CatchOutcome> {
  const confident = (d: number, margin: number) =>
    (d <= MATCH.STRONG && margin >= MATCH.STRONG_MARGIN) || (d <= MATCH.LOOSE && margin >= MATCH.LOOSE_MARGIN);

  if (opts.selfie) {
    const [b, r] = await nearestFaces(descriptor, 2);
    if (b && b.id === meId && confident(Number(b.dist), r ? Number(r.dist) - Number(b.dist) : Infinity)) return { result: "self" };
  }

  const [best, runnerUp] = await nearestFaces(descriptor, 2, meId);
  if (!best || Number(best.dist) > MATCH.UNSURE) return { result: "nomatch" };
  const d = Number(best.dist);
  const margin = runnerUp ? Number(runnerUp.dist) - d : Infinity;
  if (!confident(d, margin)) return { result: "unclear" };
  if (!best.catchable) return { result: "hidden" };

  const inserted = await q(
    `INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2)
     ON CONFLICT (catcher_id, caught_id) DO NOTHING RETURNING caught_id`,
    [meId, best.id],
  );
  return { result: inserted.length ? "caught" : "already", username: best.username };
}
