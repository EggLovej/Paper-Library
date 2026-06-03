import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ArXiv Sieve",
    short_name: "Sieve",
    description: "Sort papers before they rot in your inbox.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f4ea",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/logo.webp",
        sizes: "any",
        type: "image/webp",
      },
    ],
  };
}
