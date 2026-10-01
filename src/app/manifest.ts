import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plata Clara",
    short_name: "Plata Clara",
    description: "Ingresos, gastos, obligaciones y tarjetas de crédito, mes a mes.",
    lang: "es-CO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f1ea",
    theme_color: "#1f5a45",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mes actual", url: "/mes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Movimientos", url: "/movimientos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
