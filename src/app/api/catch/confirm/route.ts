import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { answerAsk } from "@/lib/catching";
import { rateLimit } from "@/lib/ratelimit";

/** The thrower's answer to "is this them?": a username from the options, or none of them. */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const attempt = Number(body.attempt);
  if (!Number.isSafeInteger(attempt) || attempt <= 0) return NextResponse.json({ error: "Throw the DevBall again." }, { status: 400 });
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : null;

  // Saying "yes" is capped so this can't become a way to farm catches by pointing at random faces.
  if (username) {
    const limited = await rateLimit(`confirm:${me.id}`, 8, 600);
    if (limited) return limited;
  }

  const r = await answerAsk(me.id, attempt, username);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
