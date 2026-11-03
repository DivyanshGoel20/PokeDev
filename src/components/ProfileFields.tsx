"use client";
import type { CSSProperties } from "react";
import { TYPES, TYPE_KEYS } from "@/lib/types";

export type Profile = {
  displayName: string;
  building: string;
  type: string;
  xHandle: string;
  farcaster: string;
  telegram: string;
};

export const emptyProfile: Profile = { displayName: "", building: "", type: "", xHandle: "", farcaster: "", telegram: "" };

export function ProfileFields({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <>
      <div className="field">
        <label>Your name *</label>
        <input className="input" maxLength={40} value={value.displayName} onChange={set("displayName")} placeholder="Vitalik B." />
      </div>
      <div className="field">
        <label>Pick your type *</label>
        <div className="type-grid">
          {TYPE_KEYS.map((k) => (
            <button
              type="button"
              key={k}
              className="type-chip"
              data-on={value.type === k}
              style={{ "--c": TYPES[k].color } as CSSProperties}
              onClick={() => onChange({ ...value, type: k })}
            >
              <span style={{ fontSize: 20 }}>{TYPES[k].emoji}</span> {TYPES[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>What are you building?</label>
        <textarea
          className="input"
          rows={2}
          maxLength={140}
          value={value.building}
          onChange={set("building")}
          placeholder="A ZK coprocessor for…"
          style={{ resize: "none" }}
        />
      </div>
      <p className="small muted" style={{ margin: "4px 0 10px" }}>
        Socials (optional). Only people who catch you can see these.
      </p>
      <div className="field input-prefix">
        <span>𝕏</span>
        <input className="input" autoCapitalize="none" value={value.xHandle} onChange={set("xHandle")} placeholder="X handle" />
      </div>
      <div className="field input-prefix">
        <span>🟪</span>
        <input className="input" autoCapitalize="none" value={value.farcaster} onChange={set("farcaster")} placeholder="Farcaster" />
      </div>
      <div className="field input-prefix">
        <span>✈️</span>
        <input className="input" autoCapitalize="none" value={value.telegram} onChange={set("telegram")} placeholder="Telegram" />
      </div>
    </>
  );
}
