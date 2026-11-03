/* eslint-disable @next/next/no-img-element */
/** The PokeDev ball: the Devcon-inspired ball artwork, used for every ball in the app. */
export function BrandBall({
  size = 48,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src="/brand/ball.png"
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", width: size, height: size, flexShrink: 0, ...style }}
    />
  );
}
