import Link from "next/link";
import type { CSSProperties } from "react";
import { typeInfo, type PublicUser } from "@/lib/types";

export function dexNo(n: number) {
  return `#${String(n).padStart(3, "0")}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name }: { name: string }) {
  return <div className="avatar">{initials(name)}</div>;
}

export function PlayerCard({ user, caughtAt }: { user: PublicUser; caughtAt?: string }) {
  const t = typeInfo(user.type);
  return (
    <div className="card" style={{ "--c": t.color } as CSSProperties}>
      <div className="card-inner">
        <div className="card-top">
          <span className="type-badge">
            {t.emoji} {t.label}
          </span>
          <span className="mono">{dexNo(user.number)}</span>
        </div>
        <Avatar name={user.displayName} />
        <div className="card-name">{user.displayName}</div>
        <div className="card-handle mono">@{user.username}</div>
        {user.building && (
          <div className="card-building">
            <small>Building</small>
            {user.building}
          </div>
        )}
        {(user.xHandle || user.farcaster || user.telegram) && (
          <div className="socials">
            {user.xHandle && (
              <a className="social" href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer">
                𝕏 @{user.xHandle}
              </a>
            )}
            {user.farcaster && (
              <a className="social" href={`https://farcaster.xyz/${user.farcaster}`} target="_blank" rel="noreferrer">
                🟪 {user.farcaster}
              </a>
            )}
            {user.telegram && (
              <a className="social" href={`https://t.me/${user.telegram}`} target="_blank" rel="noreferrer">
                ✈️ {user.telegram}
              </a>
            )}
          </div>
        )}
        <div className="stats">
          <div className="stat">
            <b>{user.catchCount}</b>
            <span>builders caught</span>
          </div>
          <div className="stat">
            <b>{user.caughtCount}</b>
            <span>times caught</span>
          </div>
        </div>
        {caughtAt && (
          <p className="small muted" style={{ margin: "12px 0 0" }}>
            Caught {new Date(caughtAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}

export function MiniCard({ user }: { user: PublicUser }) {
  const t = typeInfo(user.type);
  return (
    <Link href={`/u/${user.username}`} className="mini" style={{ "--c": t.color } as CSSProperties}>
      <span className="num mono">{dexNo(user.number)}</span>
      <Avatar name={user.displayName} />
      <h3>{user.displayName}</h3>
      <p>
        {t.emoji} {t.label}
      </p>
    </Link>
  );
}
