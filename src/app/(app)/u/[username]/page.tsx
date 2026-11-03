import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { publicUserByUsername } from "@/lib/users";
import { typeInfo } from "@/lib/types";
import { PlayerCard, dexNo } from "@/components/PlayerCard";
import { DevBall } from "@/components/DevBall";

export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const me = (await getUser())!;
  const found = await publicUserByUsername(decodeURIComponent(username));
  if (!found) notFound();

  const isMe = found.id === me.id;
  const [c] = isMe
    ? [{ created_at: "" }]
    : await q<{ created_at: string }>("SELECT created_at FROM catches WHERE catcher_id = $1 AND caught_id = $2", [
        me.id,
        found.id,
      ]);
  const t = typeInfo(found.user.type);

  return (
    <main className="page">
      <Link href="/dex" className="small muted">
        ← PokeDev
      </Link>
      <div style={{ marginTop: 16 }} className="fade-up">
        {c ? (
          <PlayerCard user={found.user} caughtAt={c.created_at ? new Date(c.created_at).toISOString() : undefined} />
        ) : (
          // Not caught yet: only show a silhouette, like an unseen dex entry.
          <div className="card locked" style={{ "--c": "#3b3466" } as CSSProperties}>
            <div className="card-inner">
              <div className="card-top">
                <span className="type-badge">
                  {t.emoji} {t.label}
                </span>
                <span className="mono">{dexNo(found.user.number)}</span>
              </div>
              <div className="avatar">?</div>
              <div className="card-name">{found.user.displayName}</div>
              <div className="card-handle mono">@{found.user.username}</div>
              <div className="card-building center" style={{ marginTop: 18 }}>
                <DevBall size={40} />
                <p style={{ margin: "8px 0 0" }}>Catch them to unlock their card and socials.</p>
              </div>
            </div>
          </div>
        )}
      </div>
      {isMe && (
        <Link href="/me" className="btn btn-ghost" style={{ marginTop: 16 }}>
          Edit my card
        </Link>
      )}
    </main>
  );
}
