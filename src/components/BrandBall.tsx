/* eslint-disable @next/next/no-img-element */
/** The PokeDev ball (from the "Find me at Pokedev.in" logo). */
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
