/** The DevBall: red top, cream bottom, ink band, with a diamond-cut button. Flat, outlined. */
export function DevBall({ size = 64, className = "", style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden>
      <circle cx="50" cy="50" r="45" fill="#fffdf8" />
      <path d="M5 50 A45 45 0 0 1 95 50 Z" fill="#f04a3e" />
      <path d="M14 40 A38 38 0 0 1 40 12" stroke="#fff" strokeOpacity=".55" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M8 62 A45 45 0 0 0 92 62" stroke="#e7ddcb" strokeWidth="7" fill="none" />
      <rect x="5" y="46" width="90" height="8" fill="#1d1d22" />
      <circle cx="50" cy="50" r="15" fill="#1d1d22" />
      <circle cx="50" cy="50" r="10" fill="#fffdf8" />
      <path d="M50 44 L54.5 50 L50 56 L45.5 50 Z" fill="#dc2b2b" />
      <circle cx="50" cy="50" r="45" fill="none" stroke="#1d1d22" strokeWidth="5" />
    </svg>
  );
}
