/** Builder "types", styled after classic monster-game elemental types. */
export const TYPES = {
  zk: { label: "ZK", name: "Zero-Knowledge", color: "#705898", fg: "#fff" },
  l2: { label: "L2", name: "Layer 2", color: "#F8D030", fg: "#3a2f00" },
  defi: { label: "DeFi", name: "DeFi", color: "#78C850", fg: "#14320a" },
  nft: { label: "NFT", name: "NFT / Art", color: "#F85888", fg: "#fff" },
  infra: { label: "Infra", name: "Infrastructure", color: "#A8A8C0", fg: "#22222e" },
  ai: { label: "AI", name: "AI x Crypto", color: "#F08030", fg: "#fff" },
  pg: { label: "PubGood", name: "Public Goods", color: "#6890F0", fg: "#fff" },
} as const;

export type DevType = keyof typeof TYPES;
export const TYPE_KEYS = Object.keys(TYPES) as DevType[];

export function typeInfo(t: string) {
  return TYPES[t as DevType] ?? TYPES.infra;
}

/** One row of the PokeDev: every registered player, in sign-up order. */
export type DexEntry = {
  no: number;
  type: DevType;
  isMe: boolean;
  caught: boolean;
  // Only present for yourself and players you have caught:
  username?: string;
  displayName?: string;
  building?: string;
  xHandle?: string;
  farcaster?: string;
  telegram?: string;
  caughtAt?: string;
  hasPhoto?: boolean;
  catchCount?: number;
  caughtCount?: number;
};

export type RankRow = { username: string; displayName: string; type: DevType; catches: number; isMe: boolean };

export type Me = {
  no: number;
  username: string;
  displayName: string;
  building: string;
  type: DevType;
  xHandle: string;
  farcaster: string;
  telegram: string;
  catchable: boolean;
  catchCount: number;
  caughtCount: number;
  rank: number;
};

export type AppState = { me: Me; dex: DexEntry[]; ranks: RankRow[] };

export function trainerLevel(catches: number) {
  return 1 + Math.floor(Math.sqrt(catches * 2));
}

/** Max euclidean distance between face descriptors to count as the same person. */
export const MATCH_THRESHOLD = 0.45;
/** If the runner-up is this close to the best match, the result is ambiguous and rejected. */
export const MATCH_MARGIN = 0.06;
