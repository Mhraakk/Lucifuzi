import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "آریا آموزش",
    short_name: "آریا آموزش",
    description:
      "سامانه آموزش عملیاتی کارکنان طلافروشی — گالری طلای آریا",
    start_url: "/login/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3efe8",
    theme_color: "#9a7b4f",
    lang: "fa",
    dir: "rtl",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
