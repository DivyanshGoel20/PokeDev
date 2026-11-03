import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { cleanDescriptor, nearestFaces, publicUserById } from "@/lib/users";
import { MATCH_MARGIN, MATCH_THRESHOLD } from "@/lib/types";

/**
 * Match a face seen through the camera against registered players.
 * The descriptor is compared and then discarded: nothing about unmatched faces is stored.
 */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!me.has_face) return NextResponse.json({ error: "Scan your own face first" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const descriptor = cleanDescriptor(body.descriptor);
  if (!descriptor) return NextResponse.json({ error: "Bad face data" }, { status: 400 });

  const [best, runnerUp] = await nearestFaces(descriptor, 2);
  if (!best || Number(best.dist) > MATCH_THRESHOLD) return NextResponse.json({ result: "nomatch" });
  // Two players look almost equally similar: don't guess, ask for a closer look.
  if (runnerUp && Number(runnerUp.dist) - Number(best.dist) < MATCH_MARGIN) return NextResponse.json({ result: "unclear" });
  if (best.id === me.id) return NextResponse.json({ result: "self" });
  if (!best.catchable) return NextResponse.json({ result: "hidden" });

  const inserted = await q(
    `INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING caught_id`,
    [me.id, best.id],
  );
  const user = await publicUserById(best.id);
  return NextResponse.json({ result: inserted.length ? "caught" : "already", user });
}
