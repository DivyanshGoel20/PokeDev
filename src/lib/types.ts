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

/** Extra profile links beyond X / Farcaster / Telegram. */
export type Link = { label: string; url: string };
export const MAX_LINKS = 5;
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
  links?: Link[];
  caughtAt?: string;
  /** Profile picture URL (only for yourself and players you have caught). */
  avatar?: string;
  catchCount?: number;
  caughtCount?: number;
};

export type RankRow = { username: string; displayName: string; type: DevType; catches: number; isMe: boolean; avatar?: string };

export type Me = {
  no: number;
  username: string;
  displayName: string;
  building: string;
  type: DevType;
  xHandle: string;
  farcaster: string;
  telegram: string;
  links: Link[];
  catchable: boolean;
  avatar?: string;
  catchCount: number;
  caughtCount: number;
  rank: number;
};

/** Someone who caught you. If you've caught them too, `no` points to their dex entry. */
export type CaughtBy = { displayName: string; username: string; type: DevType; at: string; no: number; caughtBack: boolean; avatar?: string };

export type AppState = { me: Me; dex: DexEntry[]; ranks: RankRow[]; caughtBy: CaughtBy[] };


/** Minimum "facing the camera" score (1 = straight on) to register or catch a face. */
export const FRONTAL_MIN = 0.55;
export const FRONTAL_MIN_SCAN = 0.65;

/** Max euclidean distance between face descriptors to count as the same person. */
export const MATCH_THRESHOLD = 0.45;
/** If the runner-up is this close to the best match, the result is ambiguous and rejected. */
export const MATCH_MARGIN = 0.06;
