import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { cleanPhoto, profileFields } from "@/lib/users";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limited = await rateLimit(`signup-ip:${clientIp(req)}`, 300, 3600);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const p = profileFields(body);

  if (!/^[a-z0-9_]{3,20}$/.test(username))
    return NextResponse.json({ error: "Username: 3-20 letters, numbers or _" }, { status: 400 });
  if (password.length < 6 || password.length > 100)
    return NextResponse.json({ error: "Passcode must be at least 6 characters" }, { status: 400 });
  if (!p.displayName) return NextResponse.json({ error: "Add your name" }, { status: 400 });
  if (!p.type) return NextResponse.json({ error: "Pick at least one type" }, { status: 400 });

  const existing = await q("SELECT 1 FROM users WHERE username = $1", [username]);
  if (existing.length) return NextResponse.json({ error: "That username is taken" }, { status: 409 });

  const avatar = cleanPhoto(body.avatar);
  // One-time invite from a catch attempt: redeemed when this player finishes their face scan.
  const invite = typeof body.invite === "string" && /^[a-z0-9]{12,40}$/.test(body.invite) ? body.invite : null;
  // Who brought this player in: the owner of a catch invite, or the username in an invite QR link.
  let referredBy: number | null = null;
  if (invite) {
    const [inv] = await q<{ catcher_id: number }>("SELECT catcher_id FROM invites WHERE token = $1", [invite]);
    referredBy = inv?.catcher_id ?? null;
  }
  const ref = typeof body.ref === "string" ? body.ref.trim().toLowerCase().replace(/^@/, "") : "";
  if (!referredBy && /^[a-z0-9_]{3,20}$/.test(ref)) {
    const [r] = await q<{ id: number }>("SELECT id FROM users WHERE username = $1", [ref]);
    referredBy = r?.id ?? null;
  }

  const rows = await q<{ id: number }>(
    `INSERT INTO users (username, pass_hash, display_name, building, type, x_handle, farcaster, telegram, links, avatar, avatar_at, invite_token, type2)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10::text IS NULL THEN NULL ELSE now() END, $11, $12) RETURNING id`,
    [
      username,
      await hashPassword(password),
      p.displayName,
      p.building,
      p.type,
      p.xHandle,
      p.farcaster,
      p.telegram,
      JSON.stringify(p.links),
      avatar,
      invite,
      p.type2,
    ],
  );
  if (referredBy) await q("UPDATE users SET referred_by = $1, referred_at = now() WHERE id = $2", [referredBy, rows[0].id]);
  await createSession(rows[0].id);
  return NextResponse.json({ ok: true });
}
