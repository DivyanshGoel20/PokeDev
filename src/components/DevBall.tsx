import { BrandBall } from "./BrandBall";

/** The DevBall used across the app is the Devcon-branded PokeDev ball. */
export function DevBall(props: { size?: number; className?: string; style?: React.CSSProperties }) {
  return <BrandBall {...props} />;
}
