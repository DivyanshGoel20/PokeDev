export const TYPES = {
  zk: { label: "ZK", emoji: "🔐", color: "#a78bfa" },
  l2: { label: "L2", emoji: "⚡", color: "#facc15" },
  defi: { label: "DeFi", emoji: "🏦", color: "#34d399" },
  nft: { label: "NFT / Art", emoji: "🎨", color: "#f472b6" },
  infra: { label: "Infra", emoji: "🛠️", color: "#60a5fa" },
  ai: { label: "AI x Crypto", emoji: "🧠", color: "#fb923c" },
  pg: { label: "Public Goods", emoji: "🌱", color: "#4ade80" },
} as const;

export type DevType = keyof typeof TYPES;
export const TYPE_KEYS = Object.keys(TYPES) as DevType[];

export function typeInfo(t: string) {
  return TYPES[t as DevType] ?? TYPES.infra;
}

export type PublicUser = {
  username: string;
  displayName: string;
  building: string;
  type: DevType;
  xHandle: string;
  farcaster: string;
  telegram: string;
  number: number;
  caughtCount: number;
  catchCount: number;
};

/** Max euclidean distance between face descriptors to count as the same person. */
export const MATCH_THRESHOLD = 0.45;
/** If the runner-up is this close to the best match, the result is ambiguous and rejected. */
export const MATCH_MARGIN = 0.06;
