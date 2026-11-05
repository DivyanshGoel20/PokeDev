import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { cleanDescriptor } from "@/lib/users";
import { tryCatch } from "@/lib/catching";
import { rateLimit } from "@/lib/ratelimit";

/** A finite number in range, or nothing. These only describe the reading; they never decide a catch. */
function num(v: unknown, max: number) {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

/**
 * Match a face seen through the camera against registered players.
 * Only the 128-number descriptor is sent here; no photo is ever uploaded.
 */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!me.has_face) return NextResponse.json({ error: "Scan your own face first" }, { status: 403 });
  const limited = await rateLimit(`catch:${me.id}`, 40, 60);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const descriptor = cleanDescriptor(body.descriptor);
  if (!descriptor) return NextResponse.json({ error: "Bad face data" }, { status: 400 });

  // Which camera took the picture: only the selfie camera can ever see the catcher themselves.
  return NextResponse.json(
    await tryCatch(me.id, descriptor, {
      selfie: body.facing === "user",
      canAsk: body.canAsk === true,
      frames: num(body.frames, 100),
      facePx: num(body.facePx, 10000),
      frontal: num(body.frontal, 1),
      readMs: num(body.readMs, 120000),
    }),
  );
}
