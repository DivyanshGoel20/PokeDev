"use client";
import { useEffect } from "react";

/**
 * Mobile browsers restore pages from the back/forward cache without asking the server.
 * On signed-out pages (landing, login, join) that would show a stale "log in" screen to someone
 * who just signed in, so reload: the server then redirects signed-in players into the app.
 */
export function FreshOnBack() {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}
