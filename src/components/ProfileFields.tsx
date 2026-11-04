"use client";
import { useRef, useState } from "react";
import { MAX_LINKS, TYPES, TYPE_KEYS, type Link } from "@/lib/types";
import type { FieldErrors } from "@/lib/client";

export type Profile = {
  displayName: string;
  building: string;
  type: string;
  /** Optional second builder type ("" when none). */
  type2: string;
  xHandle: string;
  farcaster: string;
  telegram: string;
  /** Existing picture URL, a new JPEG data URL, or null (none / removed). */
  avatar?: string | null;
  links: Link[];
};

export const emptyProfile: Profile = { displayName: "", building: "", type: "", type2: "", xHandle: "", farcaster: "", telegram: "", avatar: null, links: [] };

/** Center-crop and shrink a picked image to a 320x320 JPEG data URL. */
async function toAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = 320;
    c.getContext("2d")!.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      320,
      320,
    );
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AvatarPicker({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  return (
    <div className="field">
      <label>Profile picture (optional)</label>
      <div className="row">
        <button
          type="button"
          onClick={() => input.current?.click()}
          style={{
            width: 92,
            height: 92,
            borderRadius: 22,
            border: "2.5px dashed var(--line)",
            background: "var(--card)",
            padding: 0,
            overflow: "hidden",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
          }}
          aria-label="Choose profile picture"
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 30, color: "var(--muted)" }}>+</span>
          )}
        </button>
        <div style={{ flex: 1 }}>
          <div className="small muted" style={{ lineHeight: 1.45 }}>
            Shown on your card to players who catch you.
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => input.current?.click()}>
              {value ? "Change" : "Add photo"}
            </button>
            {value && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => onChange(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {err && <div className="error" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErr("");
          try {
            onChange(await toAvatar(f));
          } catch {
            setErr("Couldn't read that picture. Try another one.");
          }
        }}
      />
    </div>
  );
}

export function ProfileFields({
  value,
  onChange,
  errors = {},
}: {
  value: Profile;
  onChange: (p: Profile) => void;
  errors?: FieldErrors;
}) {
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const [tooMany, setTooMany] = useState(false);
  const picked = [value.type, value.type2].filter(Boolean).length;
  if (tooMany && picked < 2) setTooMany(false);

  return (
    <>
      <AvatarPicker value={value.avatar} onChange={(avatar) => onChange({ ...value, avatar })} />
      <div className="field" id="f-displayName" data-invalid={!!errors.displayName}>
        <label htmlFor="in-displayName">
          Your name<span className="req">*</span>
        </label>
        <input
          id="in-displayName"
          className="input"
          maxLength={40}
          value={value.displayName}
          onChange={set("displayName")}
          placeholder="Ada Lovelace"
          autoComplete="name"
          aria-required
          aria-invalid={!!errors.displayName}
        />
        {errors.displayName && <div className="field-msg">{errors.displayName}</div>}
      </div>
      <div className="field" id="f-type" data-invalid={!!errors.type}>
        <label className="row spread">
          <span>
            Your type<span className="req">*</span>
          </span>
          <span className="muted" style={{ fontWeight: 600 }}>
            Pick 1 or 2 · {[value.type, value.type2].filter(Boolean).length}/2
          </span>
        </label>
        <div className="type-grid">
          {TYPE_KEYS.map((k) => (
            <button
              type="button"
              key={k}
              className="type-pick"
              data-on={value.type === k || value.type2 === k}
              onClick={() => {
                if (value.type === k) return onChange({ ...value, type: value.type2, type2: "" });
                if (value.type2 === k) return onChange({ ...value, type2: "" });
                if (!value.type) return onChange({ ...value, type: k });
                if (!value.type2) return onChange({ ...value, type2: k });
                setTooMany(true); // already 2: ask them to remove one first
              }}
            >
              <span className="type" style={{ background: TYPES[k].color, color: TYPES[k].fg }}>
                {TYPES[k].label}
              </span>
              <span>{TYPES[k].name}</span>
            </button>
          ))}
        </div>
        {errors.type && <div className="field-msg">{errors.type}</div>}
        {tooMany && !errors.type && <div className="field-msg">You can pick up to 2. Tap one to remove it first.</div>}
      </div>
      <div className="field">
        <label>What are you building?</label>
        <textarea
          className="input"
          rows={2}
          maxLength={140}
          value={value.building}
          onChange={set("building")}
          placeholder="A ZK coprocessor for..."
          style={{ resize: "none" }}
        />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Socials (optional, unlocked when someone catches you)</label>
      </div>
      <div className="field input-icon">
        <span>𝕏</span>
        <input className="input" autoCapitalize="none" autoCorrect="off" value={value.xHandle} onChange={set("xHandle")} placeholder="X handle" />
      </div>
      <div className="field input-icon">
        <span>FC</span>
        <input className="input" autoCapitalize="none" autoCorrect="off" value={value.farcaster} onChange={set("farcaster")} placeholder="Farcaster" style={{ paddingLeft: 46 }} />
      </div>
      <div className="field input-icon">
        <span>TG</span>
        <input className="input" autoCapitalize="none" autoCorrect="off" value={value.telegram} onChange={set("telegram")} placeholder="Telegram" style={{ paddingLeft: 46 }} />
      </div>
      <LinksEditor links={value.links} onChange={(links) => onChange({ ...value, links })} />
    </>
  );
}

function LinksEditor({ links, onChange }: { links: Link[]; onChange: (l: Link[]) => void }) {
  const set = (i: number, k: keyof Link, v: string) => onChange(links.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="field" style={{ marginTop: 4 }}>
      {links.map((l, i) => (
        <div key={i} className="link-edit">
          <input
            className="input"
            value={l.label}
            maxLength={24}
            onChange={(e) => set(i, "label", e.target.value)}
            placeholder="Label (e.g. GitHub)"
          />
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              value={l.url}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => set(i, "url", e.target.value)}
              placeholder="github.com/you"
            />
            <button
              type="button"
              className="btn btn-sm btn-quiet"
              aria-label="Remove link"
              onClick={() => onChange(links.filter((_, j) => j !== i))}
              style={{ minHeight: 52, padding: "0 14px" }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      {links.length < MAX_LINKS && (
        <button type="button" className="btn btn-quiet" onClick={() => onChange([...links, { label: "", url: "" }])}>
          + Add another link
        </button>
      )}
    </div>
  );
}
