import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { DevBall } from "@/components/DevBall";
import { TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await getUser();
  if (me) redirect(me.has_face ? "/play" : "/scan");

  return (
    <main className="page no-nav">
      <div className="center fade-up" style={{ paddingTop: 36 }}>
        <div className="float" style={{ display: "inline-block", filter: "drop-shadow(0 20px 40px rgba(139,92,246,.6))" }}>
          <DevBall size={150} />
        </div>
        <p className="mono small" style={{ color: "var(--accent2)", margin: "28px 0 10px", letterSpacing: ".18em" }}>
          LIVE AT DEVCON
        </p>
        <h1 className="title" style={{ fontSize: 48 }}>
          Poke<span className="grad-text">Dev</span>
        </h1>
        <p className="subtitle" style={{ fontSize: 18 }}>
          Gotta catch every builder.
          <br />
          Meet someone, throw a DevBall, collect their card.
        </p>
      </div>

      <div className="stack fade-up" style={{ marginTop: 32, animationDelay: ".1s" }}>
        <Link href="/join" className="btn btn-primary">
          Join the hunt
        </Link>
        <Link href="/login" className="btn btn-ghost">
          I already have an account
        </Link>
      </div>

      <div className="panel fade-up" style={{ marginTop: 28, animationDelay: ".2s" }}>
        <h3 style={{ marginBottom: 10 }}>How it works</h3>
        <ul className="list-check">
          <li>
            <span>1️⃣</span> Sign up, pick your builder type and scan your face.
          </li>
          <li>
            <span>2️⃣</span> Spot another player, point your camera and swipe the DevBall at them.
          </li>
          <li>
            <span>3️⃣</span> Caught! Their builder card and socials land in your PokeDev.
          </li>
        </ul>
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {Object.values(TYPES).map((t) => (
            <span key={t.label} className="social" style={{ fontSize: 12, padding: "6px 10px" }}>
              {t.emoji} {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="panel fade-up" style={{ marginTop: 12, animationDelay: ".3s" }}>
        <h3 style={{ marginBottom: 10 }}>🔒 Privacy, for real</h3>
        <ul className="list-check">
          <li>Only people who signed up can be caught. Everyone else is ignored.</li>
          <li>We never store photos, only a list of numbers that can&apos;t be turned back into a face.</li>
          <li>Faces seen by the camera that don&apos;t match a player are thrown away instantly.</li>
          <li>Turn on hide mode any time, or delete everything with one tap.</li>
        </ul>
      </div>
    </main>
  );
}
