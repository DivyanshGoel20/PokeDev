/** App icon: the DevBall on the device-red background. */
export function BallIcon({ s }: { s: number }) {
  const b = s * 0.72;
  return (
    <div style={{ width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center", background: "#2f2c9e" }}>
      <div
        style={{
          width: b,
          height: b,
          borderRadius: b,
          border: `${s * 0.035}px solid #1d1d22`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div style={{ flex: 1, background: "#f2553a" }} />
        <div style={{ height: s * 0.05, background: "#1d1d22" }} />
        <div style={{ flex: 1, background: "#fffdf8" }} />
        <div
          style={{
            position: "absolute",
            left: b / 2 - s * 0.12,
            top: b / 2 - s * 0.12 - s * 0.035,
            width: s * 0.24,
            height: s * 0.24,
            borderRadius: s,
            background: "#fffdf8",
            border: `${s * 0.035}px solid #1d1d22`,
          }}
        />
      </div>
    </div>
  );
}

