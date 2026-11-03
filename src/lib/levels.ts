/** Trainer levels: a clear catch count for each level, with a title. */
export const LEVELS = [
  { level: 1, at: 0, title: "Newcomer" },
  { level: 2, at: 1, title: "First Contact" },
  { level: 3, at: 3, title: "Explorer" },
  { level: 4, at: 6, title: "Networker" },
  { level: 5, at: 10, title: "Connector" },
  { level: 6, at: 15, title: "Hall Roamer" },
  { level: 7, at: 25, title: "Super Connector" },
  { level: 8, at: 40, title: "Ace Trainer" },
  { level: 9, at: 60, title: "Legend" },
  { level: 10, at: 100, title: "PokeDev Master" },
] as const;

export function levelInfo(catches: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && catches >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return {
    level: cur.level,
    title: cur.title,
    next: next ? { level: next.level, title: next.title, at: next.at, need: next.at - catches } : null,
    progress: next ? (catches - cur.at) / (next.at - cur.at) : 1,
  };
}
