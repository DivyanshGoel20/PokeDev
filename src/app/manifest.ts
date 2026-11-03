import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PokeDev",
    short_name: "PokeDev",
    description: "Catch people, not Pokémon. Catch every builder at Devcon.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3efe6",
    theme_color: "#2f2c9e",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
