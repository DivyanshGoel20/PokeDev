"use client";
import { useState } from "react";
import { removePending, type Pending } from "@/lib/pending";
import { Lid } from "../ui";
import QrSheet from "../QrSheet";

export default function PendingSheet({ pending, inviter, onClose }: { pending: Pending; inviter: string; onClose: () => void }) {
  const [qr, setQr] = useState(false);
  const expires = new Date(pending.at + 3 * 24 * 3600 * 1000);

  return (
    <div className="sheet">
      <Lid title="No.???" subtitle="Pending builder" onBack={onClose} big={false} />
      <main className="wrap plain">
        <div className="bezel">
          <div className="lcd" style={{ padding: 10, position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.photo} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, filter: "saturate(.6)" }} />
            <span
              className="px"
              style={{ position: "absolute", right: 20, bottom: 20, background: "var(--ink)", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 16 }}
            >
              ?
            </span>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="px muted" style={{ fontSize: 10 }}>
            No.???
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>Unknown builder</div>
          <div className="muted" style={{ fontWeight: 600, marginTop: 2 }}>
            Seen{" "}
            {new Date(pending.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </div>
        </div>

        <div className="dialog" style={{ marginTop: 14 }}>
          This builder isn&apos;t on PokeDev yet. As soon as they join, they&apos;ll be added to your PokeDev automatically, with this
          photo.
        </div>

        <button className="btn btn-yellow" style={{ marginTop: 16, justifyContent: "space-between" }} onClick={() => setQr(true)}>
          <span>Show them your QR code to join</span>
          <span>→</span>
        </button>

        <p className="small muted" style={{ marginTop: 16, lineHeight: 1.5 }}>
          This photo and face data are stored only on this phone, never on our servers. They&apos;re deleted automatically on{" "}
          {expires.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} if they don&apos;t join.
        </p>
        <button
          className="btn btn-danger"
          style={{ marginTop: 10 }}
          onClick={() => {
            removePending(pending.id);
            onClose();
          }}
        >
          Forget this builder
        </button>
      </main>
      {qr && <QrSheet inviter={inviter} photo={pending.photo} onClose={() => setQr(false)} />}
    </div>
  );
}
