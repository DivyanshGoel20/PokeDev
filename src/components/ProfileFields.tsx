"use client";
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
        <label>Your name</label>
        <input className="input" maxLength={40} value={value.displayName} onChange={set("displayName")} placeholder="Ada Lovelace" autoComplete="name" />
      </div>
      <div className="field">
        <label>Your type</label>
        <div className="type-grid">
          {TYPE_KEYS.map((k) => (
            <button type="button" key={k} className="type-pick" data-on={value.type === k} onClick={() => onChange({ ...value, type: k })}>
              <span className="type" style={{ background: TYPES[k].color, color: TYPES[k].fg }}>
                {TYPES[k].label}
              </span>
              <span>{TYPES[k].name}</span>
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
    </>
  );
}
