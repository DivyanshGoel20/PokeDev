import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

/** A player's profile picture. Visible only to the player and to people who caught them. */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const me = await getUser();
  if (!me) return new Response("Not signed in", { status: 401 });
  const { username } = await params;
  const rows = await q<{ avatar: string | null }>(
    `SELECT u.avatar FROM users u
     WHERE u.username = $2 AND u.avatar IS NOT NULL
       AND (u.id = $1 OR EXISTS (SELECT 1 FROM catches c WHERE c.catcher_id = $1 AND c.caught_id = u.id))`,
    [me.id, username.toLowerCase()],
  );
  const avatar = rows[0]?.avatar;
  if (!avatar) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(avatar, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      // The URL carries the upload time, so a given URL never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
