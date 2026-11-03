"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, DexEntry } from "@/lib/types";
import { loadFace } from "@/lib/face";
import { DevBall } from "../DevBall";
import { Icon } from "../ui";
import { GoHomeContext } from "../LogoLink";
import Home from "./Home";
import Dex from "./Dex";
import Ranks from "./Ranks";
import Trainer from "./Trainer";
import EntrySheet from "./EntrySheet";
import QrSheet from "../QrSheet";

const CatchGame = dynamic(() => import("../CatchGame"), { ssr: false });

export type Tab = "home" | "dex" | "ranks" | "me";
const TABS: Tab[] = ["home", "dex", "ranks", "me"];

type Overlay = { o: "catch" } | { o: "entry"; no: number } | { o: "qr" } | null;

const SEEN_KEY = "pokedev_seen_caughtby";

export default function AppShell({ initial }: { initial: AppState }) {
  const [state, setState] = useState<AppState>(initial);
  const [tab, setTabState] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [banner, setBanner] = useState<{ title: string; body: string; action?: "catch" | "entry"; no?: number } | null>(null);

  /* ---------- data ---------- */
  const refresh = useCallback(async (): Promise<AppState | null> => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.status === 401) {
        window.location.replace("/");
        return null;
      }
      if (!r.ok) return null;
      const s = (await r.json()) as AppState;
      setState(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), 15_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [refresh]);

  // Load + warm up the face models in the background so the camera opens instantly.
  useEffect(() => {
    const start = () => loadFace().catch(() => {});
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(start);
    else window.setTimeout(start, 600);
  }, []);

  // Older versions kept "pending" face data on the phone; wipe any leftovers.
  useEffect(() => {
    try {
      localStorage.removeItem("pokedev_pending_v1");
      localStorage.removeItem("pokedev_pending_v2");
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------- "your invite joined" banner ---------- */
  // Catches you made yourself are registered in `known` first, so only invite catches pop a banner.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const caught = state.dex.filter((e) => e.caught && e.username).map((e) => e.username!);
    if (!known.current) {
      known.current = new Set(caught);
      return;
    }
    const fresh = state.dex.filter((e) => e.caught && e.username && !known.current!.has(e.username));
    caught.forEach((u) => known.current!.add(u));
    if (!fresh.length) return;
    setBanner({
      title: fresh.length > 1 ? `${fresh.length} builders joined from your invites!` : `${fresh[0].displayName} joined from your invite!`,
      body: "They're in your PokeDev now. Nice onboarding.",
      action: "entry",
      no: fresh[0].no,
    });
  }, [state.dex]);

  /* ---------- "someone caught you" banner ---------- */
  useEffect(() => {
    const latest = state.caughtBy[0];
    if (!latest) return;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(SEEN_KEY) || 0);
    } catch {
      /* ignore */
    }
    const t = Date.parse(latest.at);
    if (t <= seen) return;
    try {
      localStorage.setItem(SEEN_KEY, String(t));
    } catch {
      /* ignore */
    }
    if (!seen) return; // first load on this phone: don't replay old catches
    const fresh = state.caughtBy.filter((c) => Date.parse(c.at) > seen);
    setBanner({
      title: fresh.length > 1 ? `You were caught ${fresh.length} times!` : `${latest.displayName} caught you!`,
      body: latest.caughtBack ? "You've already caught them. Nice." : "Catch them back before they get away!",
      action: latest.caughtBack ? undefined : "catch",
    });
  }, [state.caughtBy]);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(id);
  }, [banner]);

  /* ---------- navigation (hash for tabs, history entries for overlays so Back works) ---------- */
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.includes(h)) setTabState(h);
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    // Next.js keeps its own data in history.state, so only our `o` marker means "overlay".
    const onPop = (e: PopStateEvent) => {
      const o = (e.state as { o?: string } | null)?.o ? (e.state as Overlay) : null;
      setOverlay(o);
      if (homeAfterPop.current && !o) {
        homeAfterPop.current = false;
        window.history.replaceState(null, "", "#home");
        setTabState("home");
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
    window.scrollTo(0, 0);
  }, []);

  const open = useCallback((o: NonNullable<Overlay>, replace = false) => {
    if (replace) window.history.replaceState(o, "");
    else window.history.pushState(o, "");
    setOverlay(o);
  }, []);
  const close = useCallback(() => window.history.back(), []);

  const openCatch = useCallback(() => open({ o: "catch" }), [open]);
  // Header ball: close any open sheet and go to the Home tab.
  const homeAfterPop = useRef(false);
  const goHome = useCallback(() => {
    // An open sheet/camera has its own history entry: step back over it first so Back stays sane.
    if ((window.history.state as { o?: string } | null)?.o) {
      homeAfterPop.current = true;
      window.history.back();
      return;
    }
    setOverlay(null);
    window.history.replaceState(null, "", "#home");
    setTabState("home");
    window.scrollTo(0, 0);
  }, []);
  const openEntry = useCallback((no: number) => open({ o: "entry", no }), [open]);
  const openQr = useCallback(() => open({ o: "qr" }), [open]);

  const onCaught = useCallback(
    async (username: string): Promise<DexEntry | null> => {
      known.current?.add(username);
      const s = (await refresh()) ?? stateRef.current;
      return s.dex.find((e) => e.username === username) ?? null;
    },
    [refresh],
  );

  const entry = overlay?.o === "entry" ? state.dex.find((e) => e.no === overlay.no) : undefined;

  return (
    <GoHomeContext.Provider value={goHome}>
      <div key={tab} className="screen">
        {tab === "home" && <Home state={state} onCatch={openCatch} onEntry={openEntry} onInvite={openQr} setTab={setTab} />}
        {tab === "dex" && <Dex state={state} onEntry={openEntry} />}
        {tab === "ranks" && <Ranks state={state} onEntry={openEntry} />}
        {tab === "me" && <Trainer state={state} refresh={refresh} onInvite={openQr} />}
      </div>

      <nav className="tabbar">
        <div className="tabbar-inner">
          <TabBtn t="home" cur={tab} set={setTab} label="Home" icon={<Icon.home />} />
          <TabBtn t="dex" cur={tab} set={setTab} label="PokeDev" icon={<Icon.dex />} />
          <button className="tab-catch" onClick={openCatch} aria-label="Catch">
            <span className="ring">
              <DevBall size={54} />
            </span>
          </button>
          <TabBtn t="ranks" cur={tab} set={setTab} label="Ranks" icon={<Icon.trophy />} />
          <TabBtn t="me" cur={tab} set={setTab} label="Trainer" icon={<Icon.user />} />
        </div>
      </nav>

      {entry && <EntrySheet entry={entry} onClose={close} />}
      {overlay?.o === "qr" && <QrSheet inviter={state.me.username} onClose={close} />}

      {banner && (
        <div
          className="pop"
          onClick={() => {
            const b = banner;
            setBanner(null);
            if (b.action === "catch") openCatch();
            else if (b.action === "entry" && b.no) openEntry(b.no);
          }}
          style={{
            position: "fixed",
            top: "calc(env(safe-area-inset-top) + 10px)",
            left: 12,
            right: 12,
            zIndex: 95,
            maxWidth: 520,
            margin: "0 auto",
            background: "var(--card)",
            border: "3px solid var(--ink)",
            borderRadius: 16,
            boxShadow: "0 5px 0 var(--ink)",
            padding: "12px 14px",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <DevBall size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{banner.title}</div>
            <div className="small muted">{banner.body}</div>
          </div>
          {banner.action && (
            <span className="px" style={{ fontSize: 9, color: "var(--red)" }}>
              {banner.action === "catch" ? "CATCH ›" : "VIEW ›"}
            </span>
          )}
        </div>
      )}

      {overlay?.o === "catch" && (
        <CatchGame
          caughtCount={state.me.catchCount}
          inviter={state.me.username}
          onClose={close}
          onCaught={onCaught}
          onOpenEntry={(no) => open({ o: "entry", no }, true)}
        />
      )}
    </GoHomeContext.Provider>
  );
}

function TabBtn({ t, cur, set, label, icon }: { t: Tab; cur: Tab; set: (t: Tab) => void; label: string; icon: React.ReactNode }) {
  return (
    <button className="tab" data-on={cur === t} onClick={() => set(t)}>
      {icon}
      {label}
    </button>
  );
}
