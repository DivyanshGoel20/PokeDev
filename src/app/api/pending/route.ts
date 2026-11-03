import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { cleanDescriptor } from "@/lib/users";
import { tryCatch } from "@/lib/catching";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Re-check pending entries (faces of people who weren't players when you threw).
 * The descriptors live only on the catcher's phone; here they are compared against
 * registered players and discarded. Anyone who has since joined is caught automatically.
 */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!me.has_face) return NextResponse.json({ error: "Scan your own face first" }, { status: 403 });
  const limited = await rateLimit(`pending:${me.id}`, 12, 60);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const list = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const results = await Promise.all(
    list.map(async (it: unknown) => {
      const item = it as { id?: unknown; descriptor?: unknown };
      const descriptor = cleanDescriptor(item.descriptor);
      if (typeof item.id !== "string" || !descriptor) return null;
      return { id: item.id, ...(await tryCatch(me.id, descriptor)) };
    }),
  );
  return NextResponse.json({ results: results.filter(Boolean) });
}
