/** The PokeDev "DevBall": violet top, dark bottom, glowing ETH-diamond button. */
export function DevBall({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="db-top" cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#d8c8ff" />
          <stop offset="35%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3b1680" />
        </radialGradient>
        <radialGradient id="db-bot" cx="35%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#3a3560" />
          <stop offset="100%" stopColor="#0d0b1c" />
        </radialGradient>
        <radialGradient id="db-btn" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#22d3ee" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#db-bot)" />
      <path d="M3 50 A47 47 0 0 1 97 50 Z" fill="url(#db-top)" />
      <rect x="3" y="46" width="94" height="8" fill="#07060f" />
      <circle cx="50" cy="50" r="15" fill="#07060f" />
      <circle cx="50" cy="50" r="10.5" fill="url(#db-btn)" />
      <path d="M50 42.5 L55 50 L50 53 L45 50 Z M50 54.2 L55 51.2 L50 57.5 L45 51.2 Z" fill="#4c1d95" opacity="0.85" />
      <ellipse cx="34" cy="24" rx="13" ry="7" fill="#fff" opacity="0.35" transform="rotate(-30 34 24)" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
    </svg>
  );
}
