"use client";
import Link from "next/link";
import { createContext, useContext } from "react";
import { BrandBall } from "./BrandBall";

/** Inside the app shell this switches to the Home tab (and closes overlays) instantly. */
export const GoHomeContext = createContext<(() => void) | null>(null);

/** The header ball: always takes you to the home page. */
export function LogoLink({ size }: { size: number }) {
  const goHome = useContext(GoHomeContext);
  const style = { display: "inline-flex", borderRadius: "50%", flexShrink: 0 } as const;
  if (goHome)
    return (
      <button onClick={goHome} aria-label="Home" style={{ ...style, background: "none", border: 0, padding: 0 }}>
        <BrandBall size={size} />
      </button>
    );
  return (
    <Link href="/" aria-label="Home" style={style}>
      <BrandBall size={size} />
    </Link>
  );
}
