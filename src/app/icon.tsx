import { ImageResponse } from "next/og";
import { BallIcon } from "@/components/BallIcon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BallIcon s={512} />, size);
}
