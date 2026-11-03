import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { profileFields } from "@/lib/users";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limited = await rateLimit(`signup-ip:${clientIp(req)}`, 60, 3600);
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
  if (!p.type) return NextResponse.json({ error: "Pick your type" }, { status: 400 });

  const existing = await q("SELECT 1 FROM users WHERE username = $1", [username]);
  if (existing.length) return NextResponse.json({ error: "That username is taken" }, { status: 409 });

  const rows = await q<{ id: number }>(
    `INSERT INTO users (username, pass_hash, display_name, building, type, x_handle, farcaster, telegram)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [username, await hashPassword(password), p.displayName, p.building, p.type, p.xHandle, p.farcaster, p.telegram],
  );
  await createSession(rows[0].id);
  return NextResponse.json({ ok: true });
}
