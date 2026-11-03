import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { buildState } from "@/lib/users";
import { DevBall } from "@/components/DevBall";
import { Lid } from "@/components/ui";
import AppShell from "@/components/app/AppShell";

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
      <Lid title="POKEDEV" subtitle="Devcon edition" />
      <main className="wrap plain">
        <div className="bezel screen" style={{ marginTop: 6 }}>
          <div className="lcd center" style={{ padding: "30px 16px 26px" }}>
            <DevBall size={120} className="bob" />
            <h1 className="px" style={{ fontSize: 24, marginTop: 26, lineHeight: 1.3 }}>
              POKEDEV
            </h1>
            <p style={{ margin: "14px 0 0", fontWeight: 600, fontSize: 16, lineHeight: 1.45 }}>
              Gotta catch every builder.
              <br />
              Meet people, throw a DevBall, fill your dex.
            </p>
          </div>
        </div>

        <div className="stack" style={{ marginTop: 22 }}>
          <Link href="/join" className="btn btn-red">
            New trainer
          </Link>
          <Link href="/login" className="btn">
            Continue
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
              <span>Spot another player, point your camera at them and swipe the DevBall.</span>
            </li>
            <li>
              <span className="num-dot">3</span>
              <span>Gotcha! Their entry, photo from the moment and socials land in your PokeDev.</span>
            </li>
          </ol>
        </div>

        <div className="section-label">
          <span>Privacy</span>
        </div>
        <div className="panel">
          <ul className="list-plain">
            <li>Only registered players can be caught. If someone throws at a person who isn&apos;t playing, that photo stays on the thrower&apos;s phone only and is deleted after 3 days.</li>
            <li>Your face scan is saved as 128 numbers used only for matching, never as a photo or video.</li>
            <li>When someone catches you, they keep the snapshot of that moment. Only they can see it, and it&apos;s only uploaded after a match.</li>
            <li>You have to blink to be caught, so nobody can catch you from a photo.</li>
            <li>Hide mode any time. Deleting your account erases everything, including those snapshots.</li>
          </ul>
        </div>
      </main>
    </>
  );
}
