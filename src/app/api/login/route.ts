import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { clientIp, isLimited, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  // Shared venue Wi-Fi puts many people behind one IP, so the IP limit is generous;
  // the per-username limit is what stops passcode guessing.
  const ipLimited = await rateLimit(`login-ip:${clientIp(req)}`, 400, 600);
  if (ipLimited) return ipLimited;
  // Only wrong passcodes count towards the per-username limit.
  if (await isLimited(`login-fail:${username}`, 8, 600))
    return NextResponse.json({ error: "Too many wrong passcodes. Wait 10 minutes and try again." }, { status: 429 });
  const rows = await q<{ id: number; pass_hash: string }>(
    "SELECT id, pass_hash FROM users WHERE username = $1",
    [username],
  );
  if (!rows[0] || !(await verifyPassword(password, rows[0].pass_hash))) {
    await rateLimit(`login-fail:${username}`, 8, 600);
    return NextResponse.json({ error: "Wrong username or passcode" }, { status: 401 });
  }
  await createSession(rows[0].id);
  return NextResponse.json({ ok: true });
}
