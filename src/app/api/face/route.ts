import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { cleanDescriptor, nearestFaces } from "@/lib/users";
import { MATCH_THRESHOLD } from "@/lib/types";
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
  const clash = near.find((n) => n.id !== me.id && Number(n.dist) < MATCH_THRESHOLD - 0.05);
  if (clash)
    return NextResponse.json({ error: "This face is already registered to another player" }, { status: 409 });

  await q("UPDATE users SET face = $1::float8[] WHERE id = $2", [descriptor, me.id]);
  return NextResponse.json({ ok: true });
}
