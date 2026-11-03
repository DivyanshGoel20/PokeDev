import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { buildState } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const state = await buildState(me.id);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
