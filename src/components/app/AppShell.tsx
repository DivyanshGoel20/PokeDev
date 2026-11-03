"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, DexEntry } from "@/lib/types";
import { loadFace } from "@/lib/face";
import { postJSON } from "@/lib/client";
import { listPending, removePending, type Pending } from "@/lib/pending";
import { DevBall } from "../DevBall";
import { Icon } from "../ui";
import Home from "./Home";
import Dex from "./Dex";
import Ranks from "./Ranks";
import Trainer from "./Trainer";
import EntrySheet from "./EntrySheet";
import PendingSheet from "./PendingSheet";
import QrSheet from "../QrSheet";

const CatchGame = dynamic(() => import("../CatchGame"), { ssr: false });

export type Tab = "home" | "dex" | "ranks" | "me";
const TABS: Tab[] = ["home", "dex", "ranks", "me"];

type Overlay = { o: "catch" } | { o: "entry"; no: number } | { o: "pending"; id: string } | { o: "qr" } | null;

const SEEN_KEY = "pokedev_seen_caughtby";

export default function AppShell({ initial }: { initial: AppState }) {
  const [state, setState] = useState<AppState>(initial);
  const [tab, setTabState] = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [pending, setPending] = useState<Pending[]>([]);
  const [banner, setBanner] = useState<{ title: string; body: string; action?: "catch" | "entry"; no?: number } | null>(null);

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

  /* ---------- pending entries (stored only on this phone) ---------- */
  useEffect(() => {
    const sync = () => setPending(listPending());
    sync();
    window.addEventListener("pokedev-pending", sync);
    return () => window.removeEventListener("pokedev-pending", sync);
  }, []);

  const checking = useRef(false);
  const checkPending = useCallback(async () => {
    const list = listPending();
    if (!list.length || checking.current) return;
    checking.current = true;
    try {
      const r = await postJSON<{ results?: { id: string; result: string; username?: string }[] }>("/api/pending", {
        items: list.map((p) => ({ id: p.id, descriptor: p.descriptor })),
      });
      const joined = (r.results ?? []).filter((x) => (x.result === "caught" || x.result === "already") && x.username);
      for (const x of r.results ?? []) {
        if (x.result === "self") removePending(x.id);
      }
      if (!joined.length) return;
      for (const x of joined) removePending(x.id);
      const s = await refresh();
      const first = s?.dex.find((e) => e.username === joined[0].username);
      setBanner({
        title: "A pending builder joined!",
        body:
          joined.length > 1
            ? `${joined.length} pending builders were added to your PokeDev.`
            : `${first?.displayName ?? "They"} just joined and was added to your PokeDev.`,
        action: first ? "entry" : undefined,
        no: first?.no,
      });
    } finally {
      checking.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    checkPending();
    const onVis = () => document.visibilityState === "visible" && checkPending();
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => document.visibilityState === "visible" && checkPending(), 20_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [checkPending]);

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
  const openPending = useCallback((id: string) => open({ o: "pending", id }), [open]);
  const openQr = useCallback(() => open({ o: "qr" }), [open]);

  const onCaught = useCallback(
    async (username: string): Promise<DexEntry | null> => {
      const s = (await refresh()) ?? stateRef.current;
      return s.dex.find((e) => e.username === username) ?? null;
    },
    [refresh],
  );

  const entry = overlay?.o === "entry" ? state.dex.find((e) => e.no === overlay.no) : undefined;
  const pendingOpen = overlay?.o === "pending" ? pending.find((p) => p.id === overlay.id) : undefined;

  return (
    <>
      <div key={tab} className="screen">
        {tab === "home" && <Home state={state} onCatch={openCatch} onEntry={openEntry} onInvite={openQr} setTab={setTab} />}
        {tab === "dex" && <Dex state={state} pending={pending} onEntry={openEntry} onPending={openPending} />}
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
      {pendingOpen && <PendingSheet pending={pendingOpen} inviter={state.me.username} onClose={close} />}
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
