/* eslint-disable @next/next/no-img-element */
/** PokeDev ball: red top, cream bottom, with the Devcon 8 India diamond in its center button. */
export function BrandBall({
  size = 48,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ position: "relative", width: size, height: size, display: "inline-block", flexShrink: 0, ...style }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
        <circle cx="50" cy="50" r="46" fill="#fffdf8" />
        <path d="M4 50 A46 46 0 0 1 96 50 Z" fill="#f2553a" />
        <path d="M14 38 A38 38 0 0 1 38 13" stroke="#fff" strokeOpacity=".5" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M9 62 A46 46 0 0 0 91 62" stroke="#e7ddcb" strokeWidth="6" fill="none" />
        <rect x="4" y="45.5" width="92" height="9" fill="#1d1d22" />
        <circle cx="50" cy="50" r="25" fill="#1d1d22" />
        <circle cx="50" cy="50" r="19.5" fill="#fffdf8" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="#1d1d22" strokeWidth="5" />
      </svg>
      <img
        src="/devcon/devcon-mark.png"
        alt=""
        draggable={false}
        style={{ position: "absolute", left: "50%", top: "50%", height: "33%", transform: "translate(-50%,-50%)" }}
      />
    </span>
  );
}
