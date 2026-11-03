"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, DexEntry } from "@/lib/types";
import { loadFace } from "@/lib/face";
import { DevBall } from "../DevBall";
import { Icon } from "../ui";
import Home from "./Home";
import Dex from "./Dex";
import Ranks from "./Ranks";
import Trainer from "./Trainer";
import EntrySheet from "./EntrySheet";

const CatchGame = dynamic(() => import("../CatchGame"), { ssr: false });

export type Tab = "home" | "dex" | "ranks" | "me";
const TABS: Tab[] = ["home", "dex", "ranks", "me"];

type Overlay = { o: "catch" } | { o: "entry"; no: number } | null;

export default function AppShell({ initial }: { initial: AppState }) {
  const [state, setState] = useState<AppState>(initial);
  const [tab, setTabState] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---------- data ---------- */
  const refresh = useCallback(async (): Promise<AppState | null> => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/";
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
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), 30_000);
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

  /* ---------- navigation (hash for tabs, history entries for overlays so Back works) ---------- */
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.includes(h)) setTabState(h);
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    const onPop = (e: PopStateEvent) => setOverlay((e.state as Overlay) ?? null);
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
  const openEntry = useCallback((no: number) => open({ o: "entry", no }), [open]);

  const onCaught = useCallback(
    async (username: string): Promise<DexEntry | null> => {
      const s = (await refresh()) ?? stateRef.current;
      return s.dex.find((e) => e.username === username) ?? null;
    },
    [refresh],
  );

  const entry = overlay?.o === "entry" ? state.dex.find((e) => e.no === overlay.no) : undefined;

  return (
    <>
      <div key={tab} className="screen">
        {tab === "home" && <Home state={state} onCatch={openCatch} onEntry={openEntry} setTab={setTab} />}
        {tab === "dex" && <Dex state={state} onEntry={openEntry} />}
        {tab === "ranks" && <Ranks state={state} onEntry={openEntry} />}
        {tab === "me" && <Trainer state={state} refresh={refresh} />}
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

      {overlay?.o === "catch" && (
        <CatchGame
          caughtCount={state.me.catchCount}
          onClose={close}
          onCaught={onCaught}
          onOpenEntry={(no) => open({ o: "entry", no }, true)}
        />
      )}
    </>
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
