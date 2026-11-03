import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const rows = await q<{ id: number; pass_hash: string }>(
    "SELECT id, pass_hash FROM users WHERE username = $1",
    [username],
  );
  if (!rows[0] || !(await verifyPassword(password, rows[0].pass_hash)))
    return NextResponse.json({ error: "Wrong username or passcode" }, { status: 401 });
  await createSession(rows[0].id);
  return NextResponse.json({ ok: true });
}
