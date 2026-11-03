/* eslint-disable @next/next/no-img-element */
import { DevBall } from "./DevBall";

/** Devcon 8 India logo on a cream chip (the logo is indigo, so it needs a light background). */
export function DevconChip({ height = 30 }: { height?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#fffdf8",
        border: "2px solid var(--ink)",
        borderRadius: 10,
        padding: "4px 8px",
        boxShadow: "0 2px 0 var(--ink)",
      }}
    >
      <img src="/devcon/devcon8-logo.png" alt="Devcon 8 India" style={{ height, width: "auto" }} draggable={false} />
    </span>
  );
}

/** Prize banner: Devcon 8 India artwork + the top-3 prize line. */
export function PrizeBanner({ rank, onClick, art = true }: { rank?: number; onClick?: () => void; art?: boolean }) {
  const inTop3 = rank !== undefined && rank <= 3;
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: 0,
        border: "3px solid var(--ink)",
        borderRadius: 20,
        overflow: "hidden",
        background: "var(--red-deep)",
        boxShadow: "0 5px 0 var(--ink)",
        textAlign: "left",
        color: "#fff",
        position: "relative",
      }}
    >
      {art && (
      <div style={{ position: "relative", height: 120 }}>
        <img
          src="/devcon/devcon8-art.webp"
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 45%" }}
          draggable={false}
        />
        <div style={{ position: "absolute", left: 10, top: 10 }}>
          <DevconChip height={24} />
        </div>
      </div>
      )}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, borderTop: art ? "3px solid var(--ink)" : "none" }}>
        <span
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: "var(--saffron)",
            border: "2.5px solid var(--ink)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Trophy />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="px" style={{ display: "block", fontSize: 10, lineHeight: 1.6, color: "var(--saffron)" }}>
            TOP 3 POKEDEV MASTERS
          </span>
          <span style={{ display: "block", fontWeight: 700, fontSize: 17 }}>win a prize at Devcon</span>
        </span>
        {rank !== undefined && (
          <span style={{ textAlign: "right" }}>
            <span className="px" style={{ display: "block", fontSize: 14, color: inTop3 ? "var(--saffron)" : "#fff" }}>
              #{rank}
            </span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{inTop3 ? "in the money" : "your rank"}</span>
          </span>
        )}
      </div>
    </button>
  );
}

function Trophy() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1d1d22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="#fffdf8" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v4M8 21h8M9.5 18h5" />
    </svg>
  );
}

export function Disclaimer() {
  return (
    <p className="center small muted" style={{ marginTop: 22, lineHeight: 1.5 }}>
      A community game played at Devcon 8 India.
      <br />
      Not an official Devcon or Ethereum Foundation app.
    </p>
  );
}

export function BallRow() {
  return (
    <span style={{ display: "inline-flex", gap: 4, verticalAlign: "middle" }}>
      <DevBall size={14} />
      <DevBall size={14} />
      <DevBall size={14} />
    </span>
  );
}
