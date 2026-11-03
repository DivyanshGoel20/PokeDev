import Link from "next/link";
import { getUser } from "@/lib/auth";
import { collection } from "@/lib/users";
import { TYPES, TYPE_KEYS } from "@/lib/types";
import { MiniCard } from "@/components/PlayerCard";
import { DevBall } from "@/components/DevBall";

export default async function DexPage() {
  const me = (await getUser())!;
  const caught = await collection(me.id);
  const typesCaught = new Set(caught.map((c) => c.type));

  return (
    <main className="page">
      <p className="mono small muted" style={{ margin: 0 }}>
        @{me.username}&apos;s
      </p>
      <h1 className="title">
        Poke<span className="grad-text">Dev</span>
      </h1>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="row spread">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{caught.length}</div>
            <div className="small muted">builders caught</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>
              {typesCaught.size}/{TYPE_KEYS.length}
            </div>
            <div className="small muted">types found</div>
          </div>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {TYPE_KEYS.map((k) => (
            <span
              key={k}
              title={TYPES[k].label}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                background: typesCaught.has(k) ? `color-mix(in srgb, ${TYPES[k].color} 25%, transparent)` : "rgba(0,0,0,.3)",
                border: `1px solid ${typesCaught.has(k) ? TYPES[k].color : "var(--line)"}`,
                filter: typesCaught.has(k) ? "none" : "grayscale(1) opacity(.35)",
              }}
            >
              {TYPES[k].emoji}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {caught.length === 0 ? (
          <div className="empty">
            <DevBall size={64} className="float" />
            <h3 style={{ marginTop: 14 }}>Your PokeDev is empty</h3>
            <p className="subtitle small">Find someone with PokeDev, point your camera at them and throw!</p>
            <Link href="/play" className="btn btn-primary" style={{ marginTop: 18 }}>
              Go catch builders
            </Link>
          </div>
        ) : (
          <div className="dex-grid">
            {caught.map((u) => (
              <MiniCard key={u.username} user={u} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
