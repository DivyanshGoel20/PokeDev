import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createSession, getUser, hashPassword } from "@/lib/auth";
import { cleanDescriptor, nearestFaces } from "@/lib/users";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { RECOVER } from "@/lib/types";

/**
 * Forgot your passcode? Your face is the key: scan it, and if it clearly matches one account,
 * that account gets the new passcode and you're signed in. All other sessions are signed out.
 * If you were mid-sign-up with a second, face-less account, that leftover account is removed.
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

  const [best, runnerUp] = await nearestFaces(descriptor, 2);
  const d = best ? Number(best.dist) : Infinity;
  const margin = runnerUp ? Number(runnerUp.dist) - d : Infinity;
  if (!best || d > RECOVER.MAX || margin < RECOVER.MARGIN) {
    return NextResponse.json(
      { error: "We couldn't confidently find an account with this face. Try again in good light, looking straight at the camera." },
      { status: 404 },
    );
  }
  const perAccount = await rateLimit(`recover-user:${best.id}`, 5, 3600);
  if (perAccount) return perAccount;

  const current = await getUser();
  await q("UPDATE users SET pass_hash = $1 WHERE id = $2", [await hashPassword(password), best.id]);
  await q("DELETE FROM sessions WHERE user_id = $1", [best.id]);
  if (current && current.id !== best.id && !current.has_face) {
    // Leftover account from a duplicate sign-up attempt: it never got a face, remove it.
    await q("DELETE FROM users WHERE id = $1", [current.id]);
  }
  await createSession(best.id);
  return NextResponse.json({ ok: true, username: best.username });
}
