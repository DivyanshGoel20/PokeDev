import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { buildState } from "@/lib/users";
import { DevBall } from "@/components/DevBall";
import { Lid } from "@/components/ui";
import AppShell from "@/components/app/AppShell";
import { FreshOnBack } from "@/components/FreshOnBack";
import { PreloadScanner } from "@/components/PreloadScanner";
import { DevconChip, Disclaimer, PrizeBanner } from "@/components/DevconBits";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await getUser();
  if (me) {
    if (!me.has_face) redirect("/scan");
    const state = await buildState(me.id);
    if (state) return <AppShell initial={state} />;
  }
  return <Landing />;
}

function Landing() {
  return (
    <>
      <FreshOnBack />
      <PreloadScanner />
      <Lid title="POKEDEV" subtitle="Catch every builder" />
      <main className="wrap plain">
        <div className="bezel screen" style={{ marginTop: 6 }}>
          <div style={{ borderRadius: 8, overflow: "hidden", position: "relative", background: "var(--red-deep)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/devcon/devcon8-art.webp"
              alt="Devcon 8 India"
              style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", left: 10, top: 10 }}>
              <DevconChip height={26} />
            </div>
            <div style={{ position: "absolute", right: 12, bottom: -2 }}>
              <DevBall size={84} className="bob" />
            </div>
          </div>
          <div className="lcd center" style={{ padding: "22px 14px 20px", marginTop: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/pokedev-logo-512.png"
              alt="PokeDev"
              width={150}
              height={150}
              style={{ width: 150, height: 150, borderRadius: 26, border: "3px solid var(--ink)", boxShadow: "0 4px 0 var(--ink)", margin: "0 auto 18px", display: "block" }}
            />
            <h1 className="px" style={{ fontSize: 26, lineHeight: 1.3 }}>
              POKEDEV
            </h1>
            <p style={{ margin: "12px 0 0", fontWeight: 700, fontSize: 18, lineHeight: 1.35 }}>Catch every builder at Devcon</p>
            <p className="px" style={{ margin: "14px 0 0", fontSize: 10, lineHeight: 1.8 }}>
              CATCH PEOPLE LIKE POKEMON.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <PrizeBanner art={false} />
        </div>

        <div className="stack" style={{ marginTop: 22 }}>
          <Link href="/join" className="btn btn-red">
            Start catching
          </Link>
          <Link href="/login" className="btn">
            I already play
          </Link>
        </div>

        <div className="section-label">
          <span>How to play</span>
        </div>
        <div className="panel">
          <ol className="list-plain">
            <li>
              <span className="num-dot">1</span>
              <span>Register as a trainer, pick your builder type and scan your face.</span>
            </li>
            <li>
              <span className="num-dot">2</span>
              <span>Spot a builder in the halls, get them to face you, point your camera and swipe the DevBall.</span>
            </li>
            <li>
              <span className="num-dot">3</span>
              <span>Gotcha! Their card, profile picture and socials land in your PokeDev.</span>
            </li>
          </ol>
        </div>

        <div className="section-label">
          <span>Privacy</span>
        </div>
        <div className="panel">
          <ul className="list-plain">
            <li>The camera never records or uploads photos or videos. It only reads faces in the moment, on your phone.</li>
            <li>Your face scan is saved as 128 numbers used only for matching.</li>
            <li>Only registered players can be caught. If you throw at someone who isn&apos;t playing, nothing about them is kept, anywhere.</li>
            <li>Your profile picture is optional, and only players who catch you can see it.</li>
            <li>Hide mode any time. Deleting your account erases everything.</li>
          </ul>
        </div>
        <Disclaimer />
      </main>
    </>
  );
}
