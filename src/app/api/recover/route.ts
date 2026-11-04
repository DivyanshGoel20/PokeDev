import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { cleanDescriptor, nearestFaces } from "@/lib/users";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { RECOVER } from "@/lib/types";

/**
 * Forgot your passcode? Your face is the key: scan it, and if it clearly matches one account,
 * that account gets the new passcode and you're signed in. All other sessions are signed out.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(`recover-ip:${clientIp(req)}`, 15, 3600);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 6 || password.length > 100)
    return NextResponse.json({ error: "New passcode must be at least 6 characters" }, { status: 400 });
  const descriptor = cleanDescriptor(body.descriptor);
  if (!descriptor) return NextResponse.json({ error: "Bad face data, try again" }, { status: 400 });

  // You must say WHICH account is yours, and your face must clearly match that account:
  // a face that merely resembles someone can never unlock their account.
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase().replace(/^@/, "") : "";
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return NextResponse.json({ error: "Enter your username" }, { status: 400 });
  const [target] = await q<{ id: number; username: string }>("SELECT id, username FROM users WHERE username = $1 AND face IS NOT NULL", [
    username,
  ]);
  const perAccount = await rateLimit(`recover-user:${username}`, 5, 3600);
  if (perAccount) return perAccount;
  const [best, runnerUp] = await nearestFaces(descriptor, 2);
  const d = best ? Number(best.dist) : Infinity;
  const margin = runnerUp ? Number(runnerUp.dist) - d : Infinity;
  if (!target || !best || best.id !== target.id || d > RECOVER.MAX || margin < RECOVER.MARGIN) {
    return NextResponse.json(
      { error: "Your face doesn't clearly match that account. Check the username, then scan again in good light, looking straight at the camera." },
      { status: 404 },
    );
  }

  await q("UPDATE users SET pass_hash = $1 WHERE id = $2", [await hashPassword(password), best.id]);
  await q("DELETE FROM sessions WHERE user_id = $1", [best.id]);
  await createSession(best.id);
  return NextResponse.json({ ok: true, username: best.username });
}
