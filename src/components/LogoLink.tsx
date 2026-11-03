"use client";
import Link from "next/link";
import { createContext, useContext } from "react";


/** Inside the app shell this switches to the Home tab (and closes overlays) instantly. */
export const GoHomeContext = createContext<(() => void) | null>(null);

/** The PokeDev logo tile: the Devcon-inspired ball on red. */
function Logo({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/pokedev-logo-192.png"
      alt="PokeDev"
      width={size}
      height={size}
      draggable={false}
      style={{ width: size, height: size, borderRadius: size * 0.22, border: "2px solid #fff", boxShadow: "0 0 0 2px var(--ink)", display: "block" }}
    />
  );
}

/** The header logo: always takes you to the home page. */
export function LogoLink({ size }: { size: number }) {
  const goHome = useContext(GoHomeContext);
  const style = { display: "inline-flex", borderRadius: size * 0.22, flexShrink: 0 } as const;
  if (goHome)
    return (
      <button onClick={goHome} aria-label="Home" style={{ ...style, background: "none", border: 0, padding: 0 }}>
        <Logo size={size} />
      </button>
    );
  return (
    <Link href="/" aria-label="Home" style={style}>
      <Logo size={size} />
    </Link>
  );
}
