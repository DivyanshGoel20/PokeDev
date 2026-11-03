import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { destroySession, getUser } from "@/lib/auth";
import { cleanPhoto, profileFields } from "@/lib/users";

export async function PATCH(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (typeof body.catchable === "boolean") {
    await q("UPDATE users SET catchable = $1 WHERE id = $2", [body.catchable, me.id]);
  }
  if (body.profile && typeof body.profile === "object") {
    const p = profileFields(body.profile as Record<string, unknown>);
    if (!p.displayName) return NextResponse.json({ error: "Add your name" }, { status: 400 });
    if (!p.type) return NextResponse.json({ error: "Pick your type" }, { status: 400 });
    await q(
      `UPDATE users SET display_name=$1, building=$2, type=$3, x_handle=$4, farcaster=$5, telegram=$6 WHERE id=$7`,
      [p.displayName, p.building, p.type, p.xHandle, p.farcaster, p.telegram, me.id],
    );
    // Profile picture: a new JPEG data URL replaces it, null removes it, anything else leaves it alone.
    const raw = (body.profile as Record<string, unknown>).avatar;
    if (raw === null) {
      await q("UPDATE users SET avatar = NULL, avatar_at = NULL WHERE id = $1", [me.id]);
    } else if (typeof raw === "string" && raw.startsWith("data:")) {
      const avatar = cleanPhoto(raw);
      if (!avatar) return NextResponse.json({ error: "That picture couldn't be used, try another one" }, { status: 400 });
      await q("UPDATE users SET avatar = $1, avatar_at = now() WHERE id = $2", [avatar, me.id]);
    }
  }
  return NextResponse.json({ ok: true });
}

/** Delete account: profile, face data, sessions and every catch involving this player. */
export async function DELETE() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await destroySession();
  await q("DELETE FROM users WHERE id = $1", [me.id]);
  return NextResponse.json({ ok: true });
}
