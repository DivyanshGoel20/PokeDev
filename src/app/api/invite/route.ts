import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Create a one-time invite after throwing at someone who isn't a player yet.
 * When they sign up with it and finish their face scan, the catch is recorded for you.
 */
export async function POST() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await rateLimit(`invite:${me.id}`, 20, 600);
  if (limited) return limited;
  const token = randomBytes(12).toString("hex");
  await q("INSERT INTO invites (token, catcher_id) VALUES ($1, $2)", [token, me.id]);
  return NextResponse.json({ token });
}

/** Who sent this invite (for the join screen). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[a-z0-9]{12,40}$/.test(token)) return NextResponse.json({ valid: false });
  const rows = await q<{ display_name: string; username: string }>(
    `SELECT u.display_name, u.username FROM invites i JOIN users u ON u.id = i.catcher_id
     WHERE i.token = $1 AND i.used_by IS NULL AND i.created_at > now() - interval '6 hours'`,
    [token],
  );
  return rows[0]
    ? NextResponse.json({ valid: true, displayName: rows[0].display_name, username: rows[0].username })
    : NextResponse.json({ valid: false });
}
