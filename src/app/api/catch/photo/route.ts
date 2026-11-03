import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { cleanPhoto } from "@/lib/users";
import { rateLimit } from "@/lib/ratelimit";

/** Attach the catch-moment snapshot to a catch you already made (first photo wins). */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await rateLimit(`photo:${me.id}`, 40, 60);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const photo = cleanPhoto(body.photo);
  const username = typeof body.username === "string" ? body.username.toLowerCase() : "";
  if (!photo || !username) return NextResponse.json({ error: "Bad photo" }, { status: 400 });

  const rows = await q(
    `UPDATE catches c SET photo = $3
     FROM users u
     WHERE u.id = c.caught_id AND c.catcher_id = $1 AND u.username = $2 AND c.photo IS NULL
     RETURNING c.caught_id`,
    [me.id, username, photo],
  );
  return NextResponse.json({ ok: true, saved: rows.length > 0 });
}
