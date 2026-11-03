import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

/** The snapshot taken when *you* caught this player. Only visible to the catcher. */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const me = await getUser();
  if (!me) return new Response("Not signed in", { status: 401 });
  const { username } = await params;
  const rows = await q<{ photo: string | null }>(
    `SELECT c.photo FROM catches c JOIN users u ON u.id = c.caught_id
     WHERE c.catcher_id = $1 AND u.username = $2`,
    [me.id, username.toLowerCase()],
  );
  const photo = rows[0]?.photo;
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(photo, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      // URL carries the catch timestamp, so the image for a given URL never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
