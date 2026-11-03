import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PokeDev",
    short_name: "PokeDev",
    description: "Catch people like Pokémon. Catch every builder at Devcon.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3efe6",
    theme_color: "#2f2c9e",
    icons: [
      { src: "/brand/pokedev-logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/pokedev-logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
