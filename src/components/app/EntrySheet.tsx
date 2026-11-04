"use client";
import { builderTitle, type DexEntry } from "@/lib/types";
import { Lid, Portrait, TypeBadge, dexNo } from "../ui";

export default function EntrySheet({ entry: e, onClose }: { entry: DexEntry; onClose: () => void }) {
  const known = e.caught || e.isMe;

  return (
    <div className="sheet">
      <Lid title={dexNo(e.no)} subtitle={e.isMe ? "Your entry" : known ? "Caught" : "Not caught yet"} onBack={onClose} big={false} />
      <main className="wrap plain">
        <div className="bezel">
          <div className="lcd" style={{ padding: 10 }}>
            <div style={{ width: "100%", aspectRatio: "1 / 1" }}>
              <Portrait
                size="100%"
                radius={8}
                username={e.username}
                displayName={e.displayName}
                type={e.type}
                caught={e.caught || e.isMe}
                avatar={e?.avatar}
              />
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="px muted" style={{ fontSize: 10 }}>
            {dexNo(e.no)}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, lineHeight: 1.15 }}>{known ? e.displayName : "??????"}</div>
          <div className="muted" style={{ fontWeight: 600, marginTop: 2 }}>
            {known ? `@${e.username} · ${builderTitle(e.type, e.type2)}` : builderTitle(e.type, e.type2)}
          </div>
          {known && e.referredBy && (
            <div className="small muted" style={{ marginTop: 4, fontWeight: 600 }}>
              Joined via @{e.referredBy.username}&apos;s invite
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <TypeBadge type={e.type} type2={e.type2} />
          </div>

          {known && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 0,
                marginTop: 16,
                borderTop: "2px dashed var(--line)",
              }}
            >
              <Info label="Catches" value={String(e.catchCount ?? 0)} />
              <Info label="Times caught" value={String(e.caughtCount ?? 0)} />
              {e.caughtAt && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <Info
                    label="Caught on"
                    value={new Date(e.caughtAt).toLocaleString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog" style={{ marginTop: 14 }}>
          {known
            ? e.building
              ? e.building
              : "This builder keeps what they're working on a mystery. Ask them!"
            : "No data. Find this builder at Devcon and catch them to unlock their entry."}
        </div>

        {known && !e.isMe && (e.xHandle || e.farcaster || e.telegram || (e.links?.length ?? 0) > 0) && (
          <div className="stack" style={{ marginTop: 16 }}>
            {e.xHandle && <Social href={`https://x.com/${e.xHandle}`} label="X" handle={`@${e.xHandle}`} />}
            {e.farcaster && <Social href={`https://farcaster.xyz/${e.farcaster}`} label="Farcaster" handle={e.farcaster} />}
            {e.telegram && <Social href={`https://t.me/${e.telegram}`} label="Telegram" handle={`@${e.telegram}`} />}
            {e.links?.map((l) => (
              <Social key={l.url} href={l.url} label={l.label} handle={new URL(l.url).hostname.replace(/^www\./, "")} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 0 0" }}>
      <div className="px muted" style={{ fontSize: 8, letterSpacing: ".06em" }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontWeight: 700, fontSize: 17, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Social({ href, label, handle }: { href: string; label: string; handle: string }) {
  return (
    <a className="btn" href={href} target="_blank" rel="noreferrer" style={{ justifyContent: "space-between" }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span className="muted" style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {handle} ↗
      </span>
    </a>
  );
}
