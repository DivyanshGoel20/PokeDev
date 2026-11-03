"use client";
import { useEffect, useState } from "react";
import { focusField, postJSON, type FieldErrors } from "@/lib/client";
import { Lid } from "@/components/ui";
import { ProfileFields, emptyProfile, type Profile } from "@/components/ProfileFields";

export default function Join() {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<FieldErrors>({});

  function fail(e: FieldErrors) {
    setErrs(e);
    const first = (["username", "password", "displayName", "type"] as const).find((k) => e[k]);
    if (first) focusField(`f-${first}`);
  }
  const [ref, setRef] = useState("");
  const [invite, setInvite] = useState<{ token: string; name: string } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setRef((sp.get("ref") ?? "").replace(/[^a-z0-9_]/gi, "").slice(0, 20));
    const token = (sp.get("invite") ?? "").replace(/[^a-z0-9]/g, "");
    if (token) {
      fetch(`/api/invite?t=${token}`)
        .then((r) => r.json())
        .then((d: { valid?: boolean; displayName?: string }) => {
          if (d.valid) setInvite({ token, name: d.displayName ?? "A trainer" });
        })
        .catch(() => {});
    }
  }, []);

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const e2: FieldErrors = {};
    if (!username) e2.username = "Pick a username";
    else if (!/^[a-z0-9_]{3,20}$/.test(username)) e2.username = "3-20 characters: lowercase letters, numbers or _";
    if (!password) e2.password = "Choose a passcode";
    else if (password.length < 6) e2.password = "At least 6 characters";
    if (Object.keys(e2).length) return fail(e2);
    setErrs({});
    setStep(1);
    window.scrollTo(0, 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const e2: FieldErrors = {};
    if (!profile.displayName.trim()) e2.displayName = "Add your name so people know who they caught";
    if (!profile.type) e2.type = "Pick the type that fits you best";
    if (Object.keys(e2).length) return fail(e2);
    setErrs({});
    setBusy(true);
    const r = await postJSON("/api/signup", { username, password, ...profile, invite: invite?.token });
    if (r.error) {
      setBusy(false);
      if (/username/i.test(r.error)) {
        setStep(0);
        fail({ username: r.error });
      } else if (/name/i.test(r.error)) fail({ displayName: r.error });
      else if (/type/i.test(r.error)) fail({ type: r.error });
      else {
        setError(r.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else {
      window.location.href = "/scan?new=1";
    }
  }

  return (
    <>
      {step === 0 ? (
        <Lid title="NEW TRAINER" subtitle="Step 1 of 3" backHref="/" big={false} />
      ) : (
        <Lid title="NEW TRAINER" subtitle="Step 2 of 3" onBack={() => setStep(0)} big={false} />
      )}
      <main className="wrap plain">
        <div className="steps">
          <i data-on="true" />
          <i data-on={step >= 1} />
          <i />
        </div>

        {step === 0 ? (
          <form onSubmit={next} className="screen" key="s0">
            <div className="dialog" style={{ marginBottom: 22 }}>
              {invite
                ? `${invite.name} just tried to catch you, but you're not live yet! Join now and you'll land in their PokeDev. Catch people like Pokémon! First, pick a username.`
                : ref
                  ? `@${ref} invited you to PokeDev! Catch every builder at Devcon. First, pick a username.`
                  : "Hi there, future trainer! Catch every builder at Devcon. First, pick a username."}
            </div>
            {error && <div className="error">{error}</div>}
            <p className="small muted" style={{ margin: "0 0 14px" }}>
              Fields marked <span className="req">*</span> are required.
            </p>
            <div className="field" id="f-username" data-invalid={!!errs.username}>
              <label htmlFor="in-username">
                Username<span className="req">*</span>
              </label>
              <div className="input-icon">
                <span>@</span>
                <input
                  className="input"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  maxLength={20}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                    if (errs.username) setErrs({ ...errs, username: undefined });
                  }}
                  placeholder="satoshi"
                  id="in-username"
                  aria-invalid={!!errs.username}
                />
              </div>
              {errs.username && <div className="field-msg">{errs.username}</div>}
            </div>
            <div className="field" id="f-password" data-invalid={!!errs.password}>
              <label htmlFor="in-password">
                Passcode (6+ characters)<span className="req">*</span>
              </label>
              <input
                id="in-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={password}
                aria-invalid={!!errs.password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errs.password) setErrs({ ...errs, password: undefined });
                }}
              />
              {errs.password && <div className="field-msg">{errs.password}</div>}
            </div>
            <button className="btn btn-red" style={{ marginTop: 10 }}>
              Next
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="screen" key="s1">
            <div className="dialog" style={{ marginBottom: 22 }}>
              Now, tell us about yourself. This is your dex entry: what trainers see when they catch you.
            </div>
            {error && <div className="error">{error}</div>}
            <p className="small muted" style={{ margin: "0 0 14px" }}>
              Fields marked <span className="req">*</span> are required. Everything else is optional.
            </p>
            <ProfileFields
              value={profile}
              errors={errs}
              onChange={(p) => {
                setProfile(p);
                if (errs.displayName && p.displayName.trim()) setErrs((x) => ({ ...x, displayName: undefined }));
                if (errs.type && p.type) setErrs((x) => ({ ...x, type: undefined }));
              }}
            />
            <button className="btn btn-red" disabled={busy} style={{ marginTop: 10 }}>
              {busy ? "Registering..." : "Next: scan your face"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
