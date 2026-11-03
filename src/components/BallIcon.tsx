/* eslint-disable @next/next/no-img-element */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Devcon diamond as a data URL (icons are rendered at build time on the server). */
function markDataUrl() {
  try {
    return `data:image/png;base64,${readFileSync(join(process.cwd(), "public/devcon/devcon-mark.png")).toString("base64")}`;
  } catch {
    return null;
  }
}

/** App icon: the PokeDev ball, with the Devcon diamond in its button, on Devcon indigo. */
export function BallIcon({ s }: { s: number }) {
  const b = s * 0.78;
  const btn = s * 0.34;
  const mark = markDataUrl();
  return (
    <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: "#2f2c9e" }}>
      <div
        style={{
          width: b,
          height: b,
          borderRadius: b,
          border: `${s * 0.035}px solid #1d1d22`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div style={{ flex: 1, background: "#f2553a" }} />
        <div style={{ height: s * 0.06, background: "#1d1d22" }} />
        <div style={{ flex: 1, background: "#fffdf8" }} />
        <div
          style={{
            position: "absolute",
            left: b / 2 - btn / 2 - s * 0.035,
            top: b / 2 - btn / 2 - s * 0.035,
            width: btn,
            height: btn,
            borderRadius: s,
            background: "#fffdf8",
            border: `${s * 0.045}px solid #1d1d22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {mark && <img src={mark} alt="" width={btn * 0.36} height={btn * 0.72} />}
        </div>
      </div>
    </div>
  );
}
