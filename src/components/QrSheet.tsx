"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "./ui";
import { DevBall } from "./DevBall";

/** Full-screen QR code that brings a new player straight to sign-up. */
export default function QrSheet({ inviter, photo, onClose }: { inviter: string; photo?: string; onClose: () => void }) {
  const [svg, setSvg] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const u = `${window.location.origin}/join?ref=${encodeURIComponent(inviter)}${photo ? "&t=1" : ""}`;
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1d1d22", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [inviter, photo]);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "PokeDev", text: "Join me on PokeDev and catch builders at Devcon!", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div
      className="sheet"
      style={{ zIndex: 90, background: "var(--red)", display: "flex", flexDirection: "column" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: "calc(env(safe-area-inset-top) + 12px) 14px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#fff",
        }}
      >
        <button className="back-btn" onClick={onClose} aria-label="Close">
          <Icon.close />
        </button>
        <span className="px" style={{ fontSize: 11 }}>
          INVITE
        </span>
        <span style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px calc(env(safe-area-inset-bottom) + 20px)" }}>
        <div style={{ maxWidth: 380, width: "100%", margin: "0 auto" }}>
          <div className="center" style={{ color: "#fff", marginBottom: 16 }}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                style={{ width: 72, height: 72, borderRadius: 18, border: "3px solid #fff", margin: "0 auto 12px", objectFit: "cover" }}
              />
            ) : (
              <DevBall size={56} style={{ margin: "0 auto 12px", display: "block" }} />
            )}
            <div style={{ fontWeight: 700, fontSize: 22, lineHeight: 1.2 }}>Scan to join PokeDev</div>
            <div style={{ opacity: 0.9, marginTop: 6, fontSize: 15 }}>
              {photo ? "Once they join, they'll be added to your PokeDev automatically." : "Point their phone camera at this code."}
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              border: "4px solid var(--ink)",
              borderRadius: 24,
              padding: 18,
              boxShadow: "0 6px 0 var(--ink)",
            }}
          >
            <div
              className="qr"
              style={{ width: "100%", aspectRatio: "1 / 1" }}
              // qrcode generates a trusted, self-contained SVG
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="px center" style={{ fontSize: 9, marginTop: 12, color: "var(--muted)", wordBreak: "break-all", lineHeight: 1.6 }}>
              {url.replace(/^https?:\/\//, "")}
            </div>
          </div>

          <button className="btn" style={{ marginTop: 20 }} onClick={share}>
            Share invite link
          </button>
        </div>
      </div>
    </div>
  );
}
