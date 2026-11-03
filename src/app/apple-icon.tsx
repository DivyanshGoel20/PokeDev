import { ImageResponse } from "next/og";
import { BallIcon } from "@/components/BallIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BallIcon s={180} />, size);
}
