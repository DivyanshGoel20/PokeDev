"use client";
import { useEffect, useState } from "react";
import { onScannerProgress, preloadScanner } from "@/lib/face";

/** Start downloading the face scanner in the background, so it's ready by the time it's needed. */
export function PreloadScanner() {
  useEffect(() => {
    const start = () => preloadScanner().catch(() => {});
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const id = window.setTimeout(() => (w.requestIdleCallback ? w.requestIdleCallback(start) : start()), 300);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}

/** "Downloading face scanner... 63%" while the models download. */
export function ScannerProgressText({ fallback }: { fallback: string }) {
  return <ProgressText fallback={fallback} />;
}

function ProgressText({ fallback }: { fallback: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const off = onScannerProgress(setP);
    return () => {
      off();
    };
  }, []);
  return <>{p > 0 && p < 1 ? `Downloading face scanner... ${Math.round(p * 100)}%` : fallback}</>;
}
