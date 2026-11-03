import { typeInfo } from "@/lib/types";
import { BrandBall } from "./BrandBall";

export function dexNo(n: number) {
  return `No.${String(n).padStart(3, "0")}`;
}

export function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const t = typeInfo(type);
  return (
    <span
      className="type"
      style={{ background: t.color, color: t.fg, ...(small ? { minWidth: 0, padding: "3px 6px", fontSize: 8 } : null) }}
    >
      {t.label}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Generic person silhouette, for entries you haven't caught yet. */
export function Silhouette() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <circle cx="50" cy="38" r="18" fill="#22331d" opacity=".85" />
      <path d="M16 100 C18 72 34 62 50 62 C66 62 82 72 84 100 Z" fill="#22331d" opacity=".85" />
    </svg>
  );
}

/**
 * The picture for a dex entry: the player's profile picture if you can see it, otherwise
 * initials (yourself / no picture) or a silhouette (not caught yet).
 */
export function Portrait({
  size,
  displayName,
  type,
  caught,
  avatar,
  radius = 12,
}: {
  size: number | string;
  username?: string;
  displayName?: string;
  type: string;
  caught: boolean;
  avatar?: string;
  radius?: number;
}) {
  const t = typeInfo(type);
  const dim = typeof size === "number" ? `${size}px` : size;
  return (
    <div className="portrait" style={{ width: dim, height: dim, borderRadius: radius }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={displayName ?? ""} loading="lazy" decoding="async" draggable={false} />
      ) : displayName && caught ? (
        <div
          className="initials"
          style={{ background: t.color, color: t.fg, fontSize: typeof size === "number" ? Math.max(10, size / 3.2) : 28 }}
        >
          {initials(displayName)}
        </div>
      ) : (
        <Silhouette />
      )}
    </div>
  );
}

/* ---------------- icons (stroke, 24px) ---------------- */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  home: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  ),
  dex: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <circle cx="9" cy="8" r="2" />
      <path d="M8 13h8M8 16.5h8" />
    </svg>
  ),
  trophy: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v4M8 21h8M9.5 18h5" />
    </svg>
  ),
  user: () => (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2.3" />
      <path d="M5.8 16.5c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3" />
    </svg>
  ),
  back: () => (
    <svg viewBox="0 0 24 24" {...S} width="22" height="22">
      <path d="M15 5 8 12l7 7" />
    </svg>
  ),
  close: () => (
    <svg viewBox="0 0 24 24" {...S} width="22" height="22">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  flip: () => (
    <svg viewBox="0 0 24 24" {...S} width="22" height="22">
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" />
      <path d="M4 20v-5h5" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" {...S} width="18" height="18">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  ),
};

/** Device lid used as the header on every screen: PokeDev ball logo on the left, title or custom content on the right. */
export function Lid({
  title,
  subtitle,
  onBack,
  backHref,
  big = true,
  right,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backHref?: string;
  big?: boolean;
  /** Replaces the title block (e.g. the player's picture on Home). */
  right?: React.ReactNode;
}) {
  return (
    <header className="lid">
      <div className="lid-row">
        {onBack ? (
          <button className="back-btn" onClick={onBack} aria-label="Back">
            <Icon.back />
          </button>
        ) : backHref ? (
          <a className="back-btn" href={backHref} aria-label="Back">
            <Icon.back />
          </a>
        ) : null}
        <BrandBall size={big ? 50 : 38} />
        {right ?? (
          <div className="lid-title">
            <b>{title}</b>
            {subtitle && <span>{subtitle}</span>}
          </div>
        )}
      </div>
    </header>
  );
}
