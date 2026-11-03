import type { Metadata, Viewport } from "next";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-500.css";
import "@fontsource/rubik/latin-600.css";
import "@fontsource/rubik/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokeDev · Catch every builder at Devcon",
  description: "Catch people, not Pokémon. Catch every builder at Devcon 8 India. Top 3 PokeDev masters win a prize.",
  applicationName: "PokeDev",
  appleWebApp: { capable: true, title: "PokeDev · Catch every builder at Devcon", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2f2c9e",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
