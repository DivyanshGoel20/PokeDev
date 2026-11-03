import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { cleanDescriptor, nearestFaces } from "@/lib/users";
import { DUPLICATE_FACE } from "@/lib/types";
import { rateLimit } from "@/lib/ratelimit";

/** Register (or replace) the signed-in player's face descriptor. Only the 128 numbers are stored. */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await rateLimit(`face:${me.id}`, 10, 600);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const descriptor = cleanDescriptor(body.descriptor);
  if (!descriptor) return NextResponse.json({ error: "Bad face data, try again" }, { status: 400 });

  // One face, one player: stops people catching themselves with a second account.
  const near = await nearestFaces(descriptor, 3);
  const clash = near.find((n) => n.id !== me.id && Number(n.dist) < DUPLICATE_FACE);
  if (clash)
    return NextResponse.json(
      { error: "This face already has a PokeDev account. One account per person!", code: "duplicate" },
      { status: 409 },
    );

  await q("UPDATE users SET face = $1::float8[] WHERE id = $2", [descriptor, me.id]);

  // Joined from someone's "onboard them now" QR? Their catch counts now (one-time, 30-minute invite).
  const [{ invite_token: token } = { invite_token: null }] = await q<{ invite_token: string | null }>(
    "UPDATE users SET invite_token = NULL WHERE id = $1 RETURNING (SELECT invite_token FROM users WHERE id = $1)",
    [me.id],
  );
  if (token) {
    const used = await q<{ catcher_id: number }>(
      `UPDATE invites SET used_by = $2
       WHERE token = $1 AND used_by IS NULL AND catcher_id <> $2 AND created_at > now() - interval '30 minutes'
       RETURNING catcher_id`,
      [token, me.id],
    );
    if (used[0]) {
      await q("INSERT INTO catches (catcher_id, caught_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [used[0].catcher_id, me.id]);
    }
  }
  return NextResponse.json({ ok: true });
}
