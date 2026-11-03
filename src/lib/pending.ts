"use client";

/**
 * Pending entries: people you threw at who weren't players yet.
 * Stored ONLY on this phone (localStorage), never on the server. They expire after 3 days.
 */
export type Pending = { id: string; descriptor: number[]; photo: string; at: number };

const KEY = "pokedev_pending_v1";
const TTL = 3 * 24 * 3600 * 1000;
const MAX = 30;

function read(): Pending[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]") as Pending[];
    return Array.isArray(list) ? list.filter((p) => Date.now() - p.at < TTL) : [];
  } catch {
    return [];
  }
}

function write(list: Pending[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage full or blocked: drop the oldest and retry once
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, Math.max(1, list.length - 5))));
    } catch {
      /* give up silently */
    }
  }
  window.dispatchEvent(new Event("pokedev-pending"));
}

export function listPending(): Pending[] {
  return read();
}

function dist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Add (or refresh, if it's the same face) a pending entry. Returns it. */
export function addPending(descriptor: number[], photo: string): Pending {
  const list = read();
  const same = list.find((p) => dist(p.descriptor, descriptor) < 0.42);
  if (same) {
    same.at = Date.now();
    write([same, ...list.filter((p) => p !== same)]);
    return same;
  }
  const p: Pending = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), descriptor, photo, at: Date.now() };
  write([p, ...list]);
  return p;
}

export function removePending(id: string) {
  write(read().filter((p) => p.id !== id));
}
