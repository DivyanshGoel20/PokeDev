import type { Metadata, Viewport } from "next";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-500.css";
import "@fontsource/rubik/latin-600.css";
import "@fontsource/rubik/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokeDev",
  description: "Catch every builder at Devcon. Meet someone, throw a DevBall, add them to your PokeDev.",
  applicationName: "PokeDev",
  appleWebApp: { capable: true, title: "PokeDev", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#dc2b2b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
