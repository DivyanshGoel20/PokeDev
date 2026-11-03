"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DevBall } from "./DevBall";

const ITEMS = [
  { href: "/dex", label: "PokeDev", ico: "📇" },
  { href: "/play", label: "Catch", ico: "", play: true },
  { href: "/leaderboard", label: "Ranks", ico: "🏆" },
  { href: "/me", label: "Me", ico: "🙂" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          data-on={path.startsWith(it.href)}
          className={it.play ? "nav-play" : undefined}
        >
          {it.play ? (
            <span className="ball-wrap">
              <DevBall size={44} />
            </span>
          ) : (
            <span className="ico">{it.ico}</span>
          )}
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
