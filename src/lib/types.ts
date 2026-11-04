/** Builder "types", styled after classic monster-game elemental types. */
export const TYPES = {
  zk: { label: "ZK", name: "Zero-Knowledge", color: "#705898", fg: "#fff" }, // ghost
  privacy: { label: "Privacy", name: "Privacy", color: "#4A3F3A", fg: "#fff" }, // dark
  security: { label: "Security", name: "Security", color: "#5F7287", fg: "#fff" }, // steel
  core: { label: "Core", name: "Core Protocol", color: "#7038F8", fg: "#fff" }, // dragon
  l2: { label: "L2", name: "Layer 2", color: "#F8D030", fg: "#3a2f00" }, // electric
  infra: { label: "Infra", name: "Infrastructure", color: "#A8A8C0", fg: "#22222e" }, // steel (light)
  devtools: { label: "DevTools", name: "DevTools", color: "#A8B820", fg: "#26300a" }, // bug
  defi: { label: "DeFi", name: "DeFi", color: "#78C850", fg: "#14320a" }, // grass
  payments: { label: "Pay/RWA", name: "Payments / RWA", color: "#E0C068", fg: "#3a2e08" }, // ground
  ai: { label: "AI", name: "AI x Crypto", color: "#F08030", fg: "#fff" }, // fire
  nft: { label: "NFT", name: "NFT / Art", color: "#F85888", fg: "#fff" }, // psychic
  gaming: { label: "Gaming", name: "Gaming", color: "#C03028", fg: "#fff" }, // fighting
  ux: { label: "UX", name: "UX / Design", color: "#EE99AC", fg: "#4a1626" }, // fairy
  pg: { label: "PubGood", name: "Public Goods", color: "#6890F0", fg: "#fff" }, // water
} as const;

export type DevType = keyof typeof TYPES;

/** Extra profile links beyond X / Farcaster / Telegram. */
export type Link = { label: string; url: string };
export const MAX_LINKS = 5;
export const TYPE_KEYS = Object.keys(TYPES) as DevType[];

/** Each player has 1 or 2 builder types. */
export const MAX_TYPES = 2;

/** "The ZK Builder" / "The ZK & Privacy Builder" */
export function builderTitle(type: string, type2?: string | null) {
  return `The ${typeInfo(type).name}${type2 ? ` & ${typeInfo(type2).name}` : ""} Builder`;
}

export function typeInfo(t: string) {
  return TYPES[t as DevType] ?? TYPES.infra;
}

/** One row of the PokeDev: every registered player, in sign-up order. */
export type DexEntry = {
  no: number;
  type: DevType;
  type2?: DevType;
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

export type RankRow = { username: string; displayName: string; type: DevType; type2?: DevType; catches: number; rank: number; isMe: boolean; avatar?: string };

export type Me = {
  no: number;
  username: string;
  displayName: string;
  building: string;
  type: DevType;
  type2?: DevType;
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
export type CaughtBy = { displayName: string; username: string; type: DevType; type2?: DevType; at: string; no: number; caughtBack: boolean; avatar?: string };

export type AppState = { me: Me; dex: DexEntry[]; ranks: RankRow[]; caughtBy: CaughtBy[] };


/** Minimum "facing the camera" score (1 = straight on) to register or catch a face. */
export const FRONTAL_MIN = 0.55;
export const FRONTAL_MIN_SCAN = 0.65;

/**
 * Face matching (euclidean distance between 128-number fingerprints; same person is usually < 0.45).
 * - STRONG: close match, accepted unless another player is almost as close.
 * - LOOSE: accepted only when clearly closer than everyone else.
 * - Up to UNSURE we never claim "not a player"; we ask for a better look instead.
 */
export const MATCH = { STRONG: 0.47, STRONG_MARGIN: 0.04, LOOSE: 0.55, LOOSE_MARGIN: 0.1, UNSURE: 0.62 } as const;
/** Registering a face this close to another player's is refused (one face, one account). */
export const DUPLICATE_FACE = 0.45;
/** Passcode recovery by face: stricter than catching, and clearly closer than anyone else. */
export const RECOVER = { MAX: 0.42, MARGIN: 0.08 } as const;
